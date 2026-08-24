import { Injectable } from '@angular/core';
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { getRuntimeConfig } from './runtime-config';
import { Member, Profile, Team, UserContext } from './supabase.types';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  private readonly client: SupabaseClient | null;
  private readonly configurationError: string | null;

  constructor() {
    const config = getRuntimeConfig();
    this.configurationError = !config.supabaseUrl
      ? 'Supabase URL is missing. Set supabaseUrl in frontend/public/app-config.js.'
      : !config.supabaseAnonKey
        ? 'Supabase public anon key is missing. Set supabaseAnonKey in frontend/public/app-config.js.'
        : null;
    this.client = config.supabaseUrl && config.supabaseAnonKey
      ? createClient(config.supabaseUrl, config.supabaseAnonKey, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
        })
      : null;
  }

  get available(): boolean {
    return this.client !== null;
  }

  get auth() {
    if (!this.client) throw new Error(this.configurationError ?? 'Supabase is not configured.');
    return this.client.auth;
  }

  from(table: string) {
    if (!this.client) throw new Error(this.configurationError ?? 'Supabase is not configured.');
    return this.client.from(table);
  }

  rpc(functionName: string, args?: Record<string, unknown>) {
    if (!this.client) throw new Error(this.configurationError ?? 'Supabase is not configured.');
    return this.client.rpc(functionName, args);
  }

  private async edgeErrorMessage(error: unknown): Promise<string | null> {
    const response = (error as { context?: Response })?.context;
    if (!response) return null;
    try {
      const payload = await response.clone().json() as { error?: string; message?: string };
      return payload.error || payload.message || null;
    } catch {
      return null;
    }
  }

  async manageMember(input: { name: string; email: string; phone?: string | null; password: string; memberId?: string }) {
    if (!this.client) throw new Error(this.configurationError ?? 'Supabase is not configured.');
    const { data, error } = await this.client.functions.invoke('manage-member', { body: input });
    if (error) {
      const raw = await this.edgeErrorMessage(error);
      if (raw && /required|access required|already/i.test(raw)) throw new Error(raw);
      throw new Error('Could not save the member. Please try again in a few minutes.');
    }
    if (data?.error) {
      if (/required|already/i.test(String(data.error))) throw new Error(String(data.error));
      throw new Error('Could not save the member. Please try again in a few minutes.');
    }
    return data;
  }

  async registerTeam(input: { teamName: string; adminName: string; email: string; phone?: string; password: string }) {
    if (!this.client) throw new Error(this.configurationError ?? 'Supabase is not configured.');
    const { data, error } = await this.client.functions.invoke('register-team', { body: input });
    const raw = error ? await this.edgeErrorMessage(error) : data?.error ? String(data.error) : null;
    if (raw) {
      if (/already registered|already exists|user already/i.test(raw)) {
        throw new Error('An account already exists with this email. Please sign in instead.');
      }
      if (/team name, admin name|required|valid email/i.test(raw)) throw new Error(raw);
      throw new Error('We could not complete your registration right now. Please try again in a few minutes.');
    }
    return data as { userId: string; message: string };
  }

  async currentUser(): Promise<User | null> {
    if (!this.client) return null;
    const { data } = await this.client.auth.getUser();
    return data.user;
  }

  async registerTeamRequest(input: {
    teamName: string;
    adminName: string;
    adminEmail: string;
    adminPhone?: string;
  }): Promise<Team> {
    const { data, error } = await this.clientRequired().rpc('register_team_request', {
      team_name: input.teamName,
      admin_name: input.adminName,
      admin_email: input.adminEmail,
      admin_phone: input.adminPhone ?? null
    });
    if (error) throw error;
    return data as Team;
  }

  async ensureRegistrationContext(): Promise<Team | null> {
    const { data, error } = await this.clientRequired().rpc('ensure_registration_context');
    if (error) throw error;
    return (data as Team | null) ?? null;
  }

  async profile(): Promise<Profile | null> {
    const user = await this.currentUser();
    if (!user) return null;
    const { data, error } = await this.from('profiles').select('*').eq('id', user.id).maybeSingle();
    if (error) throw error;
    return data as Profile | null;
  }

  async userContext(): Promise<UserContext | null> {
    if (!this.client) return null;
    const { data, error } = await this.client.rpc('current_user_context');
    if (error) throw error;
    return (data as UserContext | null) ?? null;
  }

  async members(): Promise<Member[]> {
    const { data, error } = await this.from('members').select('*').eq('status', 'active').order('name');
    if (error) throw error;
    return (data ?? []) as Member[];
  }

  private clientRequired(): SupabaseClient {
    if (!this.client) throw new Error(this.configurationError ?? 'Supabase is not configured.');
    return this.client;
  }
}