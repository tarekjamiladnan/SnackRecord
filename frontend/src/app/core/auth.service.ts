import { Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { SupabaseService } from './supabase.service';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: 'SUPER_ADMIN' | 'TEAM_ADMIN' | 'MEMBER';
  teamId: string | null;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly user = signal<AuthUser | null>(null);
  readonly loading = signal(false);

  constructor(private supabase: SupabaseService, private router: Router) {
    void this.restoreSession();
    if (this.supabase.available) this.supabase.auth.onAuthStateChange(() => void this.restoreSession());
  }

  async restoreSession(): Promise<void> {
    if (!this.supabase.available) {
      this.user.set(null);
      return;
    }
    try {
      this.loading.set(true);
      const context = await this.supabase.userContext();
      if (!context || (context.team && context.team.status !== 'ACTIVE' && context.role !== 'SUPER_ADMIN')) {
        this.user.set(null);
        return;
      }
      this.user.set({
        id: context.id,
        email: context.email,
        name: context.name,
        role: context.role,
        teamId: context.team_id
      });
    } catch {
      this.user.set(null);
    } finally {
      this.loading.set(false);
    }
  }

  private static authError(error: unknown, fallback: string): Error {
    const raw = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? '');
    if (/invalid login credentials/i.test(raw)) return new Error('Incorrect email or password.');
    if (/email not confirmed/i.test(raw)) return new Error('Please confirm your email address before signing in.');
    if (/rate limit|too many requests|over_email_send_rate_limit/i.test(raw)) {
      return new Error('Too many attempts. Please wait a moment and try again.');
    }
    if (/already registered|already exists/i.test(raw)) {
      return new Error('An account already exists with this email. Please sign in instead.');
    }
    return new Error(fallback);
  }

  async register(teamName: string, name: string, email: string, phone: string, password: string, confirmPassword: string): Promise<string> {
    if (!this.supabase.available) throw new Error('Supabase is not configured.');
    if (password !== confirmPassword) throw new Error('Passwords do not match');
    if (password.length < 8) throw new Error('Password must be at least 8 characters');
    try {
      this.loading.set(true);
      const normalizedEmail = email.trim().toLowerCase();
      const { data, error } = await this.supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: { data: { teamName, adminName: name, phone: phone || '' } }
      });
      if (error) {
        console.error('Supabase signUp error:', { message: error.message, code: error.code, status: error.status });
        throw AuthService.authError(error, 'We could not complete your registration right now. Please try again in a few minutes.');
      }
      const signInResult = await this.supabase.auth.signInWithPassword({ email: normalizedEmail, password });
      if (signInResult.error) {
        if (data.session) await this.restoreSession();
        if (this.user()) {
          await this.router.navigateByUrl('/dashboard');
          return 'Your account and team were created successfully.';
        }
        console.error('Sign-in after registration failed:', { message: signInResult.error.message, code: signInResult.error.code });
        throw AuthService.authError(signInResult.error, 'We created your account but could not sign you in. Please try signing in manually.');
      }
      await this.supabase.ensureRegistrationContext();
      await this.restoreSession();
      if (!this.user()) throw new Error('Account created, but the team profile could not be loaded.');
      await this.router.navigateByUrl('/dashboard');
      return 'Your account and team were created successfully.';
    } catch (err) {
      if (err instanceof Error && /passwords do not match|^password must be at least|account created|sign in instead|not configured|required|valid email|already exists|already registered|profile could not be loaded/i.test(err.message)) {
        throw err;
      }
      console.error('Registration error:', err);
      throw err instanceof Error
        ? AuthService.authError(err, 'We could not complete your registration right now. Please try again in a few minutes.')
        : new Error('We could not complete your registration right now. Please try again in a few minutes.');
    } finally {
      this.loading.set(false);
    }
  }

  async login(email: string, password: string): Promise<void> {
    if (!this.supabase.available) throw new Error('Supabase is not configured.');
    try {
      this.loading.set(true);
      const { error } = await this.supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      if (error) {
        console.error('Supabase signIn error:', { message: error.message, code: error.code, status: error.status });
        throw AuthService.authError(error, 'Could not sign you in right now. Please try again.');
      }
      let context = await this.supabase.userContext().catch(() => null);
      if (!context) {
        await this.supabase.ensureRegistrationContext().catch(() => null);
        context = await this.supabase.userContext().catch(() => null);
      }
      if (!context) throw new Error('Your account has no team profile. Please complete team registration.');
      if (context.team?.status === 'PENDING') throw new Error('Your team is not active yet.');
      if (context.team?.status === 'REJECTED') throw new Error('Your team registration was rejected by the Super Admin.');
      if (context.team?.status === 'SUSPENDED') throw new Error('Your team is suspended. Contact the Super Admin.');
      await this.restoreSession();
      if (!this.user()) throw new Error('Your profile is not ready. Please contact the Super Admin.');
      await this.router.navigateByUrl(this.user()?.role === 'SUPER_ADMIN' ? '/teams' : '/dashboard');
    } catch (err) {
      throw err instanceof Error && /team profile|not active yet|rejected by the Super Admin|suspended|profile is not ready|incorrect email or password|confirm your email|too many attempts|could not sign you in|not configured/i.test(err.message)
        ? err
        : AuthService.authError(err, 'Could not sign you in right now. Please try again.');
    } finally {
      this.loading.set(false);
    }
  }

  async logout(): Promise<void> {
    if (this.supabase.available) await this.supabase.auth.signOut();
    this.user.set(null);
    await this.router.navigateByUrl('/');
  }

  async updatePassword(newPassword: string): Promise<void> {
    if (newPassword.length < 6) throw new Error('New password must be at least 6 characters');
    const { error } = await this.supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
  }

  hasRole(roles: ('SUPER_ADMIN' | 'TEAM_ADMIN' | 'MEMBER')[]): boolean {
    const userRole = this.user()?.role;
    return !!userRole && roles.includes(userRole);
  }

  isAuthenticated(): boolean {
    return !!this.user();
  }
}
