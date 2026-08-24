import { Injectable, inject, signal } from '@angular/core';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import { getRuntimeConfig } from './runtime-config';

export type PushSetupState = 'insecure' | 'unsupported' | 'not-configured' | 'denied' | 'default' | 'granted' | 'subscribed';

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

@Injectable({ providedIn: 'root' })
export class PushService {
  private readonly auth = inject(AuthService);
  private readonly supabase = inject(SupabaseService);
  private readonly vapidPublicKey = getRuntimeConfig().vapidPublicKey;

  /** Drives the dashboard setup card UI. */
  readonly state = signal<PushSetupState>('default');
  readonly busy = signal(false);

  constructor() {
    this.refresh().catch(() => undefined);
  }

  private browserSupported(): boolean {
    return typeof navigator !== 'undefined'
      && 'serviceWorker' in navigator
      && 'PushManager' in window
      && 'Notification' in window;
  }

  private computeState(hasSubscription: boolean): PushSetupState {
    if (!this.browserSupported()) return 'unsupported';
    if (!window.isSecureContext) return 'insecure';
    if (!this.vapidPublicKey) return 'not-configured';
    if (Notification.permission === 'denied') return 'denied';
    return hasSubscription ? 'subscribed' : Notification.permission === 'granted' ? 'granted' : 'default';
  }

  async refresh(): Promise<void> {
    try {
      const subscription = await this.existingSubscription();
      this.state.set(this.computeState(!!subscription));
    } catch {
      this.state.set(this.computeState(false));
    }
  }

  /**
   * Keeps stored subscriptions aligned with the signed-in user (current team,
   * refreshed keys). Called on every auth change; never deletes rows on logout
   * so a returning user's devices keep working.
   */
  async syncOnAuthChange(): Promise<void> {
    const user = this.auth.user();
    if (!user || Notification?.permission !== 'granted') return;
    try {
      const registration = await this.registrationOrNull();
      if (!registration) return;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) await this.persistSubscription(subscription);
    } catch (error) {
      console.warn('Push subscription sync skipped:', error);
    }
  }

  /** Full opt-in flow. Must be triggered from a user gesture (button click). */
  async enable(): Promise<void> {
    if (this.busy()) return;
    if (!this.browserSupported()) {
      this.state.set('unsupported');
      throw new Error('This browser does not support notifications.');
    }
    if (!window.isSecureContext) {
      this.state.set('insecure');
      throw new Error('Notifications require a secure (HTTPS) connection.');
    }
    if (!this.vapidPublicKey) {
      this.state.set('not-configured');
      throw new Error('Push is not configured for this deployment yet.');
    }

    this.busy.set(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission === 'denied') {
        this.state.set('denied');
        throw new Error('Notification permission was blocked. Enable it in your browser settings.');
      }
      if (permission !== 'granted') {
        this.state.set('default');
        throw new Error('Notification permission was not granted.');
      }

      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(this.vapidPublicKey)
        });
      }

      await this.persistSubscription(subscription);
      this.state.set('subscribed');
    } finally {
      this.busy.set(false);
    }
  }

  /** Explicit opt-out: removes both the browser subscription and the stored row. */
  async disable(): Promise<void> {
    this.busy.set(true);
    try {
      const registration = await this.registrationOrNull();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await this.supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint);
        await subscription.unsubscribe().catch(() => undefined);
      }
      this.state.set(Notification?.permission === 'denied' ? 'denied' : 'granted');
    } finally {
      this.busy.set(false);
    }
  }

  /** Admin-only self-test through the Edge Function. */
  async sendTest(): Promise<void> {
    const response = await this.supabase.functions.invoke('send-order-reminders', {
      body: { action: 'test' }
    });
    if (response.error) {
      const detail = typeof response.error.context !== 'undefined' ? undefined : response.error.message;
      throw new Error(detail ?? (response.data as { error?: string })?.error ?? 'Could not send the test notification.');
    }
    const data = response.data as { delivered?: boolean; removedInvalidSubscriptions?: number; error?: string };
    if (!data.delivered) {
      throw new Error(
        data.removedInvalidSubscriptions
          ? 'No valid device subscription found. Re-enable notifications on your device and retry.'
          : data.error ?? 'No device received the test notification.'
      );
    }
  }

  private async registrationOrNull(): Promise<ServiceWorkerRegistration | null> {
    if (!this.browserSupported()) return null;
    return (await navigator.serviceWorker.getRegistration('/')) ?? null;
  }

  private async existingSubscription(): Promise<PushSubscription | null> {
    const registration = await this.registrationOrNull();
    return registration ? registration.pushManager.getSubscription() : null;
  }

  private async persistSubscription(subscription: PushSubscription): Promise<void> {
    const user = this.auth.user();
    if (!user) throw new Error('You must be signed in to save notification settings.');
    const raw = subscription.toJSON() as {
      endpoint?: string;
      keys?: { p256dh?: string; auth?: string };
    };
    const p256dh = raw.keys?.p256dh;
    const auth = raw.keys?.auth;
    if (!raw.endpoint || !p256dh || !auth) throw new Error('The subscription returned incomplete keys.');

    const { error } = await this.supabase.from('push_subscriptions').upsert(
      {
        user_id: user.id,
        team_id: user.teamId,
        endpoint: raw.endpoint,
        p256dh,
        auth,
        user_agent: navigator.userAgent.slice(0, 300),
        updated_at: new Date().toISOString()
      },
      { onConflict: 'endpoint' }
    );
    if (error) throw new Error(error.message);
  }
}
