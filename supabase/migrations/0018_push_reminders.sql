-- Web Push reminder system:
-- 1) team_settings.timezone   -> per-team timezone used for deadline math (default Asia/Dhaka)
-- 2) push_subscriptions       -> one row per browser/device endpoint, owned by the user
-- 3) notification_logs        -> scheduler audit trail + idempotent dedupe via unique dedupe_key
--
-- The 15-minute pre-deadline reminder is computed by the send-order-reminders Edge Function
-- from team_settings.order_closing_time + timezone. Nothing is hardcoded in the frontend.

alter table public.team_settings
  add column if not exists timezone text not null default 'Asia/Dhaka';

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  team_id uuid references public.teams(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index push_subscriptions_user_idx on public.push_subscriptions(user_id);
create index push_subscriptions_team_idx on public.push_subscriptions(team_id);

alter table public.push_subscriptions enable row level security;

create policy push_subs_own_select on public.push_subscriptions for select
  using (user_id = auth.uid());
create policy push_subs_own_insert on public.push_subscriptions for insert
  with check (user_id = auth.uid());
create policy push_subs_own_update on public.push_subscriptions for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
create policy push_subs_own_delete on public.push_subscriptions for delete
  using (user_id = auth.uid());

create table public.notification_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  team_id uuid references public.teams(id) on delete cascade,
  notification_type text not null,
  scheduled_for timestamptz not null,
  sent_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  error_message text,
  dedupe_key text not null unique,
  created_at timestamptz not null default now()
);

-- Fast lookup for the scheduler: which users were already reminded for a deadline.
create index notification_logs_dedupe_idx on public.notification_logs(dedupe_key);
create index notification_logs_team_idx on public.notification_logs(team_id, scheduled_for);

alter table public.notification_logs enable row level security;

-- Users may inspect their own log; all writes happen server-side via the Edge Function's
-- service-role client (service role bypasses RLS), so clients get no write policies.
create policy notification_logs_own_read on public.notification_logs for select
  using (user_id = auth.uid());
