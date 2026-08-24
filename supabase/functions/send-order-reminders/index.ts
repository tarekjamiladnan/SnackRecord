// send-order-reminders — Web Push reminder Edge Function.
//
// Two authorized callers:
//   1. Supabase Cron (every minute) -> Authorization: Bearer <service_role_key>
//      Runs the batch: finds teams whose order deadline (team_settings.order_closing_time,
//      interpreted in team_settings.timezone) is ~15 minutes away and pushes a reminder
//      to each team member's registered devices. Idempotent via notification_logs.dedupe_key.
//   2. Authenticated admins testing their own setup -> Authorization: Bearer <user jwt>
//      body {"action":"test"} sends one immediate test notification to the CALLER's own
//      subscriptions only. Never allows notifying other users.
//
// Deploy with --no-verify-jwt (the function verifies callers itself).

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendWebPush, SendResult } from '../_shared/webpush.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const NOTIFICATION_TYPE = 'order_deadline_reminder';
const LEAD_MINUTES = 15;
const EARLY_WINDOW_MS = 90 * 1000; // fire up to 90s before the exact mark
const LATE_WINDOW_MS = 5 * 60 * 1000; // still deliver if a run was delayed, max 5 min late
const RETRY_WINDOW_MS = 10 * 60 * 1000; // retry failed sends while still relevant

interface TeamSchedule {
  teamId: string;
  closingTime: string;
  timezone: string;
}

interface ReminderPayload {
  title: string;
  body: string;
  url: string;
  type: string;
  deadline?: string;
  test?: boolean;
}

// ---------------------------------------------------------------------------
// Timezone helpers
// ---------------------------------------------------------------------------

const tzFormatCache = new Map<string, Intl.DateTimeFormat>();

function isValidTimezone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

function wallClock(date: Date, timeZone: string): { dateStr: string; secondsOfDay: number } {
  let formatter = tzFormatCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    tzFormatCache.set(timeZone, formatter);
  }
  const parts: Record<string, string> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== 'literal') parts[part.type] = part.value;
  }
  const hour = Number(parts.hour === '24' ? '0' : parts.hour);
  const minute = Number(parts.minute);
  const second = Number(parts.second);
  return {
    dateStr: `${parts.year}-${parts.month}-${parts.day}`,
    secondsOfDay: hour * 3600 + minute * 60 + second
  };
}

const pad2 = (value: number) => String(value).padStart(2, '0');

/** Instant (epoch ms) at which the given wall-clock time occurs on dateStr in timeZone. */
function zonedTimeToInstant(dateStr: string, secondsOfDay: number, timeZone: string): number {
  const hh = pad2(Math.floor(secondsOfDay / 3600));
  const mm = pad2(Math.floor((secondsOfDay % 3600) / 60));
  const ss = pad2(Math.floor(secondsOfDay % 60));
  const desired = Date.parse(`${dateStr}T${hh}:${mm}:${ss}Z`);
  let guess = desired;
  for (let i = 0; i < 3; i++) {
    const wall = wallClock(new Date(guess), timeZone);
    const asIfUtc = Date.parse(`${wall.dateStr}T${pad2(Math.floor(wall.secondsOfDay / 3600))}:${pad2(Math.floor((wall.secondsOfDay % 3600) / 60))}:${pad2(wall.secondsOfDay % 60)}Z`);
    const diff = desired - asIfUtc;
    if (diff === 0) break;
    guess += diff;
  }
  return guess;
}

function shiftDateStr(dateStr: string, days: number): string {
  const shifted = new Date(Date.parse(`${dateStr}T00:00:00Z`) + days * 24 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}

/**
 * Returns the upcoming deadline instant (epoch ms) for a team schedule around `now`,
 * or null when nothing is within the delivery window. Checks yesterday/today/tomorrow
 * wall dates so timezone/DST boundaries cannot cause misses.
 */
function findDueDeadline(schedule: { closingSeconds: number; timezone: string }, nowMs: number): { deadlineMs: number } | null {
  const todayStr = wallClock(new Date(nowMs), schedule.timezone).dateStr;
  let best: { deadlineMs: number; distance: number } | null = null;
  for (const dayOffset of [-1, 0, 1]) {
    const dateStr = shiftDateStr(todayStr, dayOffset);
    const deadlineMs = zonedTimeToInstant(dateStr, schedule.closingSeconds, schedule.timezone);
    const targetMs = deadlineMs - LEAD_MINUTES * 60 * 1000;
    const earliness = nowMs - targetMs;
    if (earliness < -EARLY_WINDOW_MS || earliness > LATE_WINDOW_MS) continue;
    if (!best || Math.abs(earliness) < best.distance) {
      best = { deadlineMs, distance: Math.abs(earliness) };
    }
  }
  return best ? { deadlineMs: best.deadlineMs } : null;
}

function parseClosingTime(raw: unknown): number | null {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(String(raw ?? '').trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3] ?? '0');
  if (hours > 23 || minutes > 59 || seconds > 59) return null;
  return hours * 3600 + minutes * 60 + seconds;
}

// ---------------------------------------------------------------------------
// Reminder sending
// ---------------------------------------------------------------------------

async function loadVapidOptions(): Promise<{ vapidPublicKey: string; vapidPrivateKey: string; vapidSubject: string }> {
  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const vapidSubject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com';
  if (!vapidPublicKey || !vapidPrivateKey) throw new Error('VAPID keys are not configured (set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY secrets)');
  return { vapidPublicKey, vapidPrivateKey, vapidSubject };
}

/** Claims the right to remind a user for one specific deadline. Idempotent + retry-safe. */
async function claimReminder(
  admin: SupabaseClient,
  userId: string,
  teamId: string,
  dedupeKey: string,
  scheduledForIso: string
): Promise<'claimed' | 'skip'> {
  const { data: inserted, error: insertError } = await admin
    .from('notification_logs')
    .upsert(
      {
        user_id: userId,
        team_id: teamId,
        notification_type: NOTIFICATION_TYPE,
        scheduled_for: scheduledForIso,
        dedupe_key: dedupeKey,
        status: 'pending'
      },
      { onConflict: 'dedupe_key', ignoreDuplicates: true }
    )
    .select('id')
    .maybeSingle();

  if (!insertError && inserted?.id) return 'claimed';
  if (insertError) throw insertError;

  // Row exists: retry failed sends, and recover claims abandoned by a crashed run.
  const { data: existing, error: selectError } = await admin
    .from('notification_logs')
    .select('status, sent_at, scheduled_for, created_at')
    .eq('dedupe_key', dedupeKey)
    .maybeSingle();
  if (selectError) throw selectError;
  if (!existing) return 'skip';
  if (existing.status === 'sent') return 'skip';
  const scheduledMs = Date.parse(existing.scheduled_for);
  const stillRelevant = Date.now() - scheduledMs <= RETRY_WINDOW_MS;
  const isAbandonedPending = existing.status === 'pending'
    && Date.now() - Date.parse(existing.created_at) > 2 * 60 * 1000;
  if ((existing.status === 'failed' && !existing.sent_at || isAbandonedPending) && stillRelevant) {
    const { error: resetError } = await admin
      .from('notification_logs')
      .update({ status: 'pending', error_message: null })
      .eq('dedupe_key', dedupeKey);
    if (resetError) throw resetError;
    return 'claimed';
  }
  return 'skip';
}

async function deliverToUser(
  admin: SupabaseClient,
  vapid: Awaited<ReturnType<typeof loadVapidOptions>>,
  userId: string,
  payload: ReminderPayload
): Promise<{ delivered: boolean; removed: number; error?: string }> {
  const { data: subscriptions, error } = await admin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', userId);
  if (error) throw error;
  if (!subscriptions?.length) return { delivered: false, removed: 0 };

  let delivered = false;
  let firstError: string | undefined;
  let removed = 0;

  for (const subscription of subscriptions) {
    const result: SendResult = await sendWebPush(subscription, payload, vapid);
    if (result.ok) {
      delivered = true;
    } else if (result.expired) {
      // Push service no longer knows this endpoint -> garbage-collect it.
      await admin.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint);
      removed++;
    } else if (!firstError) {
      firstError = result.error;
    }
  }
  return { delivered, removed, error: firstError };
}

async function runReminders(admin: SupabaseClient): Promise<Response> {
  const startedAt = Date.now();
  let vapid: Awaited<ReturnType<typeof loadVapidOptions>>;
  try {
    vapid = await loadVapidOptions();
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }

  const { data: activeTeams, error: teamsError } = await admin
    .from('teams')
    .select('id')
    .eq('status', 'ACTIVE');
  if (teamsError) return json({ error: teamsError.message }, 500);

  const activeIds = (activeTeams ?? []).map((row: { id: string }) => row.id);
  if (!activeIds.length) return json({ checkedTeams: 0, remindersSent: 0, failures: 0, removedSubscriptions: 0 });

  const { data: settingsRows, error: settingsError } = await admin
    .from('team_settings')
    .select('team_id, order_closing_time, timezone')
    .in('team_id', activeIds);
  if (settingsError) return json({ error: settingsError.message }, 500);

  let remindersSent = 0;
  let failures = 0;
  let removedSubscriptions = 0;

  for (const row of settingsRows ?? []) {
    const closingSeconds = parseClosingTime(row.order_closing_time);
    if (closingSeconds === null) {
      console.warn(`team ${row.team_id}: invalid order_closing_time ${JSON.stringify(row.order_closing_time)}; skipping`);
      continue;
    }
    const timezone = row.timezone && isValidTimezone(row.timezone) ? row.timezone : 'UTC';
    if (timezone !== row.timezone) {
      console.warn(`team ${row.team_id}: invalid timezone ${JSON.stringify(row.timezone)}; falling back to UTC`);
    }

    const due = findDueDeadline({ closingSeconds, timezone }, startedAt);
    if (!due) continue;
    const deadlineIso = new Date(due.deadlineMs).toISOString();

    const { data: recipients, error: recipientsError } = await admin
      .from('profiles')
      .select('id')
      .eq('team_id', row.team_id);
    if (recipientsError) {
      console.error(`team ${row.team_id}: could not load recipients:`, recipientsError.message);
      continue;
    }

    for (const recipient of recipients ?? []) {
      const userId: string = recipient.id;
      const dedupeKey = `${NOTIFICATION_TYPE}:${userId}:${deadlineIso}`;
      const scheduledForIso = new Date(due.deadlineMs - LEAD_MINUTES * 60 * 1000).toISOString();

      try {
        const claim = await claimReminder(admin, userId, row.team_id, dedupeKey, scheduledForIso);
        if (claim === 'skip') continue;

        const outcome = await deliverToUser(admin, vapid, userId, {
          title: '⏰ Order Reminder',
          body: "Your team's order deadline is in 15 minutes. Please submit your order.",
          url: '/order',
          type: NOTIFICATION_TYPE,
          deadline: deadlineIso
        });
        removedSubscriptions += outcome.removed;

        if (outcome.delivered) {
          remindersSent++;
          await admin.from('notification_logs')
            .update({ status: 'sent', sent_at: new Date().toISOString(), error_message: null })
            .eq('dedupe_key', dedupeKey);
        } else {
          failures++;
          await admin.from('notification_logs')
            .update({ status: 'failed', error_message: outcome.error ?? 'No subscription accepted the message' })
            .eq('dedupe_key', dedupeKey);
        }
      } catch (error) {
        failures++;
        console.error(`reminder for user ${userId} failed:`, error instanceof Error ? error.message : error);
        await admin.from('notification_logs')
          .update({
            status: 'failed',
            error_message: error instanceof Error ? error.message.slice(0, 500) : String(error)
          })
          .eq('dedupe_key', dedupeKey);
      }
    }
  }

  return json({
    checkedTeams: (settingsRows ?? []).length,
    remindersSent,
    failures,
    removedSubscriptions,
    durationMs: Date.now() - startedAt
  });
}

// ---------------------------------------------------------------------------
// Admin self-test (never sends to anyone except the authenticated caller)
// ---------------------------------------------------------------------------

async function runSelfTest(userClient: SupabaseClient, admin: SupabaseClient): Promise<Response> {
  if (Deno.env.get('PUSH_TEST_ENABLED') === 'false') {
    return json({ error: 'Test notifications are disabled' }, 403);
  }
  let vapid: Awaited<ReturnType<typeof loadVapidOptions>>;
  try {
    vapid = await loadVapidOptions();
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json({ error: 'Authentication required' }, 401);

  const { data: actor, error: actorError } = await userClient
    .from('profiles')
    .select('id, team_id, role')
    .eq('id', userData.user.id)
    .single();
  if (actorError || !actor) return json({ error: 'Profile not found' }, 403);
  if (!['TEAM_ADMIN', 'SUPER_ADMIN'].includes(actor.role)) {
    return json({ error: 'Team admin access required' }, 403);
  }

  const { data: settingsRow } = await admin
    .from('team_settings')
    .select('timezone')
    .eq('team_id', actor.team_id)
    .maybeSingle();
  void settingsRow; // reserved for timezone-aware test copy

  const outcome = await deliverToUser(admin, vapid, actor.id, {
    title: '⏰ Order Reminder',
    body: 'Test reminder — you would see this 15 minutes before your order deadline.',
    url: '/order',
    type: `${NOTIFICATION_TYPE}_test`,
    test: true
  });

  return json({
    tested: true,
    delivered: outcome.delivered,
    removedInvalidSubscriptions: outcome.removed,
    error: outcome.error ?? null,
    hint: outcome.delivered || outcome.removed
      ? undefined
      : 'No subscription received the message. Open the site, enable notifications on this device, and try again.'
  });
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method === 'GET') return json({ status: 'send-order-reminders running' });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = request.headers.get('Authorization');
  if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Configuration missing' }, 500);
  if (!authorization) return json({ error: 'Authentication required' }, 401);

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  // Scheduler / service-role path.
  if (authorization === `Bearer ${serviceRoleKey}`) {
    try {
      return await runReminders(admin);
    } catch (error) {
      console.error('batch failed:', error);
      return json({ error: error instanceof Error ? error.message : 'Internal error' }, 500);
    }
  }

  // End-user path: only the self-test action is allowed, and only for admins,
  // and it can only ever notify the caller's own devices.
  const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? serviceRoleKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authorization } }
  });
  try {
    const body = await request.json().catch(() => ({}));
    if ((body as { action?: string }).action !== 'test') {
      return json({ error: 'Unknown action' }, 400);
    }
    return await runSelfTest(userClient, admin);
  } catch (error) {
    console.error('self-test failed:', error);
    return json({ error: error instanceof Error ? error.message : 'Internal error' }, 500);
  }
});
