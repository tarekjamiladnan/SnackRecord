import { Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { createClient, Session, SupabaseClient, User } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';
import { Month, Profile, Role } from './models';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  readonly client: SupabaseClient = createClient(environment.supabaseUrl, environment.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  readonly session = signal<Session | null>(null);
  readonly user = signal<User | null>(null);
  readonly profile = signal<Profile | null>(null);
  readonly loading = signal(false);

  constructor(private router: Router) {
    void this.restoreSession().catch(() => {});
    this.client.auth.onAuthStateChange((event, session) => {
      this.session.set(session);
      this.user.set(session?.user ?? null);
      if (session?.user) void this.loadProfile().catch(() => {});
      if (event === 'SIGNED_IN' && session) void this.audit('Login', 'auth', session.user.id).catch(() => {});
      if (event === 'SIGNED_OUT') void this.router.navigateByUrl('/auth/login');
    });
  }

  async restoreSession(): Promise<void> {
    const { data } = await this.client.auth.getSession();
    this.session.set(data.session);
    this.user.set(data.session?.user ?? null);
    if (data.session?.user) {
      try {
        await this.loadProfile();
      } catch {
        // Profile may be temporarily unavailable; auth still works.
      }
    }
  }

  async loadProfile(): Promise<void> {
    const id = this.user()?.id;
    if (!id) return;
    await this.ensureProfile();
    const { data, error } = await this.client.from('profiles').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    this.profile.set((data as Profile) ?? null);
  }

  async getOpenMonth(): Promise<Month | null> {
    const { data, error } = await this.client
      .from('months')
      .select('*')
      .eq('status', 'open')
      .order('year', { ascending: false })
      .order('month', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return (data as Month) ?? null;
  }

  hasRole(roles: Role[]): boolean {
    const role = this.profile()?.role;
    return !!role && roles.includes(role);
  }

  async signIn(email: string, password: string): Promise<void> {
    const { error } = await this.client.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (error) throw error;
  }

  private async ensureProfile(): Promise<void> {
    const user = this.user();
    if (!user?.id || !user.email) return;
    const email = user.email.toLowerCase();
    const fullName = String(user.user_metadata?.['full_name'] ?? email.split('@')[0]);
    const role: Role = email === 'adnan@gmail.com' || email === 'admin@gmail.com' ? 'admin' : 'user';
    await this.client.from('profiles').upsert({ id: user.id, email, full_name: fullName, role }, { onConflict: 'id' });
    if (role === 'user') {
      await this.client
        .from('members')
        .upsert({ user_id: user.id, email, name: fullName, status: 'active' }, { onConflict: 'email' });
    }
  }

  async signOut(): Promise<void> {
    try {
      await this.audit('Logout', 'auth', this.user()?.id ?? null);
    } catch {
      // Audit failure must never block sign out.
    }
    const { error } = await this.client.auth.signOut();
    if (error) throw error;
  }

  async forgotPassword(email: string): Promise<void> {
    const { error } = await this.client.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/auth/reset-password` });
    if (error) throw error;
  }

  async updatePassword(password: string): Promise<void> {
    const { error } = await this.client.auth.updateUser({ password });
    if (error) throw error;
  }

  async audit(action: string, entity?: string | null, entityId?: string | null, metadata: Record<string, unknown> = {}): Promise<void> {
    try {
      await this.client.from('audit_logs').insert({ actor_id: this.user()?.id ?? null, action, entity, entity_id: entityId, metadata });
    } catch (err) {
      console.warn('Audit log insert failed', err);
    }
  }
}
