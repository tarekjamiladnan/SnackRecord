import { Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from './api.service';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: 'SUPER_ADMIN' | 'TEAM_ADMIN' | 'MEMBER';
  teamId: string | null;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

interface MeResponse {
  success?: boolean;
  user: AuthUser;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly user = signal<AuthUser | null>(null);
  readonly loading = signal(false);

  constructor(private api: ApiService, private router: Router) {
    void this.restoreSession();
  }

  async restoreSession(): Promise<void> {
    if (!this.api.token()) return;
    try {
      this.loading.set(true);
      const response = await this.api.get<AuthUser | MeResponse>('/auth/me');
      this.user.set('user' in response ? response.user : response);
    } catch (err) {
      const status = this.api.statusOf(err);
      if (status === 401 || status === 403 || status === 404) {
        this.api.setToken(null);
        this.user.set(null);
      }
    } finally {
      this.loading.set(false);
    }
  }

  async register(teamName: string, name: string, email: string, phone: string, password: string, confirmPassword: string): Promise<string> {
    try {
      this.loading.set(true);
      const response = await this.api.post<{ pending?: boolean; message: string }>('/auth/register', {
        teamName,
        adminName: name,
        adminEmail: email.trim().toLowerCase(),
        adminPhone: phone.trim() || undefined,
        password,
        confirmPassword
      });
      return response.message || 'Registration submitted for approval.';
    } finally {
      this.loading.set(false);
    }
  }

  async login(email: string, password: string): Promise<void> {
    try {
      this.loading.set(true);
      const response = await this.api.post<AuthResponse>('/auth/login', {
        email: email.trim().toLowerCase(),
        password
      });
      this.api.setToken(response.token);
      this.user.set(response.user);
      await this.router.navigateByUrl('/dashboard');
    } finally {
      this.loading.set(false);
    }
  }

  async logout(): Promise<void> {
    this.api.setToken(null);
    this.user.set(null);
    await this.router.navigateByUrl('/');
  }

  async updatePassword(newPassword: string): Promise<void> {
    try {
      this.loading.set(true);
      await this.api.put<void>('/auth/update-password', { newPassword });
    } finally {
      this.loading.set(false);
    }
  }

  hasRole(roles: ('SUPER_ADMIN' | 'TEAM_ADMIN' | 'MEMBER')[]): boolean {
    const userRole = this.user()?.role;
    return !!userRole && roles.includes(userRole);
  }

  isAuthenticated(): boolean {
    return !!this.api.token() && !!this.user();
  }
}
