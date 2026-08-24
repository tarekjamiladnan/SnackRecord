import { Injectable, OnDestroy, inject, signal } from '@angular/core';
import { MessageService } from 'primeng/api';
import { RealtimeChannel } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';

export interface AppNotification {
  id: string;
  teamId: string;
  recipientUserId: string;
  type: 'order_submitted' | 'order_permission_requested' | 'order_permission_approved' | 'order_permission_rejected';
  title: string;
  body: string | null;
  readAt: string | null;
  createdAt: string;
}

const camel = <T>(row: any): T => Object.fromEntries(Object.entries(row).map(([key, value]) => [
  key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()), value
])) as T;

const POLL_INTERVAL_MS = 30000;

@Injectable({ providedIn: 'root' })
export class NotificationService implements OnDestroy {
  items = signal<AppNotification[]>([]);
  unreadCount = signal(0);
  loading = signal(false);
  private userId: string | null = null;
  private channel: RealtimeChannel | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private primed = false;
  private readonly supabase = inject(SupabaseService);
  private readonly message = inject(MessageService);
  private readonly onFocus = () => void this.load();

  async watch(userId: string): Promise<void> {
    if (this.userId === userId) return;
    this.stop();
    this.userId = userId;
    await this.load();
    this.subscribe();
    this.pollTimer = setInterval(() => void this.load(), POLL_INTERVAL_MS);
    window.addEventListener('focus', this.onFocus);
  }

  stop(): void {
    if (this.channel) this.supabase.removeChannel(this.channel);
    if (this.pollTimer) clearInterval(this.pollTimer);
    window.removeEventListener('focus', this.onFocus);
    this.channel = null;
    this.pollTimer = null;
    this.userId = null;
    this.primed = false;
    this.items.set([]);
    this.unreadCount.set(0);
  }

  async load(): Promise<void> {
    if (!this.userId || !this.supabase.available) return;
    this.loading.set(true);
    try {
      const { data, error } = await this.supabase.from('notifications')
        .select('*')
        .eq('recipient_user_id', this.userId)
        .order('created_at', { ascending: false })
        .limit(30);
      if (error) throw error;
      const known = new Set(this.items().map((row) => row.id));
      const fresh = this.primed
        ? (data ?? []).map(camel<AppNotification>).filter((row) => !known.has(row.id) && !row.readAt)
        : [];
      this.primed = true;
      this.items.set((data ?? []).map(camel<AppNotification>));
      this.refreshUnread();
      for (const row of fresh.slice(0, 3)) {
        this.message.add({ severity: 'info', summary: row.title, detail: row.body ?? undefined });
      }
    } catch (err) {
      console.warn('Could not load notifications:', err);
    } finally {
      this.loading.set(false);
    }
  }

  async markAllRead(): Promise<void> {
    const unread = this.items().filter((item) => !item.readAt);
    if (!unread.length || !this.userId) return;
    this.items.update((rows) => rows.map((row) => ({ ...row, readAt: row.readAt ?? new Date().toISOString() })));
    this.unreadCount.set(0);
    try {
      await this.supabase.from('notifications').update({ read_at: new Date().toISOString() })
        .eq('recipient_user_id', this.userId).is('read_at', null);
    } catch {
      void this.load();
    }
  }

  async markRead(id: string): Promise<void> {
    const target = this.items().find((row) => row.id === id);
    if (!target?.readAt) {
      this.items.update((rows) => rows.map((row) => row.id === id ? { ...row, readAt: new Date().toISOString() } : row));
      this.refreshUnread();
      try {
        await this.supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id);
      } catch {
        void this.load();
      }
    }
  }

  async delete(id: string): Promise<void> {
    const target = this.items().find((row) => row.id === id);
    if (!target || !this.supabase.available || !this.userId) return;
    this.items.update((rows) => rows.filter((row) => row.id !== id));
    this.refreshUnread();
    try {
      const { error } = await this.supabase.from('notifications').delete()
        .eq('id', id).eq('recipient_user_id', this.userId);
      if (error) throw error;
    } catch {
      void this.load();
    }
  }

  async clearAll(): Promise<void> {
    if (!this.items().length || !this.supabase.available || !this.userId) return;
    const ids = this.items().map((row) => row.id);
    this.items.set([]);
    this.unreadCount.set(0);
    try {
      const { error } = await this.supabase.from('notifications').delete()
        .eq('recipient_user_id', this.userId).in('id', ids);
      if (error) throw error;
    } catch {
      void this.load();
    }
  }

  ngOnDestroy(): void {
    if (this.channel) this.supabase.removeChannel(this.channel);
    if (this.pollTimer) clearInterval(this.pollTimer);
  }

  private subscribe(): void {
    if (!this.userId || !this.supabase.available) return;
    this.channel = this.supabase.channel(`notifications-${this.userId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `recipient_user_id=eq.${this.userId}`
      }, () => void this.load())
      .subscribe(status => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('Notifications realtime unavailable; falling back to polling.');
        }
      });
  }

  private refreshUnread(): void {
    this.unreadCount.set(this.items().filter((row) => !row.readAt).length);
  }
}
