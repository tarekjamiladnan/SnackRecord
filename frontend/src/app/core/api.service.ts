import { Injectable, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { getRuntimeConfig } from './runtime-config';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly baseUrl = (getRuntimeConfig().apiUrl || 'http://localhost:5000/api').replace(/\/+$/, '');
  readonly token = signal<string | null>(null);
  readonly isLoading = signal(false);

  constructor(private http: HttpClient, private router: Router) {
    this.restoreToken();
  }

  private restoreToken(): void {
    const stored = localStorage.getItem('auth_token');
    if (stored) this.token.set(stored);
  }

  setToken(token: string | null): void {
    this.token.set(token);
    if (token) {
      localStorage.setItem('auth_token', token);
    } else {
      localStorage.removeItem('auth_token');
      void this.router.navigateByUrl('/auth/login');
    }
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = this.token();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  }

  private remoteError(response: unknown): Error {
    const message = response && typeof response === 'object' && typeof (response as { message?: unknown }).message === 'string'
      ? String((response as { message: string }).message).trim()
      : '';
    return new Error(message || 'Request failed. Please try again.');
  }

  private messageFromError(error: unknown): Error {
    if (error instanceof HttpErrorResponse) {
      const wrapped = new Error(this.httpErrorMessage(error));
      wrapped.name = `HttpError(${error.status})`;
      (wrapped as Error & { status?: number }).status = error.status;
      return wrapped;
    }
    if (error instanceof Error) return error;
    return new Error('Request failed. Please try again.');
  }

  private httpErrorMessage(error: HttpErrorResponse): string {
    const body = error.error;
    const bodyMessage = body && typeof body === 'object' && typeof (body as { message?: unknown }).message === 'string'
      ? String((body as { message: string }).message).trim()
      : '';
    if (bodyMessage && bodyMessage.length > 0 && bodyMessage.length <= 300) return bodyMessage;
    if (error.status === 0) return 'Could not reach the server. Check your connection and try again.';
    switch (error.status) {
      case 400: return 'Invalid input. Please check your details and try again.';
      case 401: return 'Your session has expired. Please sign in again.';
      case 403: return 'You do not have permission to perform this action.';
      case 404: return 'The requested item was not found.';
      case 409: return 'This already exists. Please use a different value and try again.';
      case 413: return 'The request was too large to process.';
      case 422: return 'The input could not be processed.';
      case 429: return 'Too many requests. Please wait a moment and try again.';
      default: return 'Something went wrong. Please try again.';
    }
  }

  statusOf(error: unknown): number | undefined {
    return (error as { status?: number } | undefined)?.status;
  }

  async get<T>(endpoint: string, params?: Record<string, unknown>): Promise<T> {
    try {
      this.isLoading.set(true);
      let httpParams = new HttpParams();
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          if (value !== null && value !== undefined) httpParams = httpParams.set(key, String(value));
        });
      }
      const response = await firstValueFrom(
        this.http.get<any>(`${this.baseUrl}${endpoint}`, {
          headers: this.getHeaders(),
          params: httpParams
        })
      );
      if (response.success === false) throw this.remoteError(response);
      return response;
    } catch (error) {
      throw this.messageFromError(error);
    } finally {
      this.isLoading.set(false);
    }
  }

  async post<T>(endpoint: string, body?: Record<string, unknown>): Promise<T> {
    try {
      this.isLoading.set(true);
      const response = await firstValueFrom(
        this.http.post<any>(`${this.baseUrl}${endpoint}`, body || {}, {
          headers: this.getHeaders()
        })
      );
      if (response.success === false) throw this.remoteError(response);
      return response;
    } catch (error) {
      throw this.messageFromError(error);
    } finally {
      this.isLoading.set(false);
    }
  }

  async put<T>(endpoint: string, body?: Record<string, unknown>): Promise<T> {
    try {
      this.isLoading.set(true);
      const response = await firstValueFrom(
        this.http.put<any>(`${this.baseUrl}${endpoint}`, body || {}, {
          headers: this.getHeaders()
        })
      );
      if (response.success === false) throw this.remoteError(response);
      return response;
    } catch (error) {
      throw this.messageFromError(error);
    } finally {
      this.isLoading.set(false);
    }
  }

  async patch<T>(endpoint: string, body?: Record<string, unknown>): Promise<T> {
    try {
      this.isLoading.set(true);
      const response = await firstValueFrom(
        this.http.patch<any>(`${this.baseUrl}${endpoint}`, body || {}, {
          headers: this.getHeaders()
        })
      );
      if (response.success === false) throw this.remoteError(response);
      return response;
    } catch (error) {
      throw this.messageFromError(error);
    } finally {
      this.isLoading.set(false);
    }
  }

  async delete<T>(endpoint: string): Promise<T> {
    try {
      this.isLoading.set(true);
      const response = await firstValueFrom(
        this.http.delete<any>(`${this.baseUrl}${endpoint}`, {
          headers: this.getHeaders()
        })
      );
      if (response.success === false) throw this.remoteError(response);
      return response;
    } catch (error) {
      throw this.messageFromError(error);
    } finally {
      this.isLoading.set(false);
    }
  }
}
