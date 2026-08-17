import { environment } from '../../environments/environment';

declare global {
  interface Window {
    __APP_CONFIG__?: {
      supabaseUrl?: string;
      supabaseAnonKey?: string;
      appName?: string;
    };
  }
}

export interface RuntimeConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  appName: string;
}

export function getRuntimeConfig(): RuntimeConfig {
  const config = window.__APP_CONFIG__ ?? {};
  const runtimeConfig: RuntimeConfig = {
    supabaseUrl: (config.supabaseUrl ?? environment.supabaseUrl ?? '').trim(),
    supabaseAnonKey: (config.supabaseAnonKey ?? environment.supabaseAnonKey ?? '').trim(),
    appName: (config.appName ?? environment.appName ?? 'Phantom Snack Record').trim() || 'Phantom Snack Record'
  };

  if (!runtimeConfig.supabaseUrl || !runtimeConfig.supabaseAnonKey) {
    console.warn('Supabase runtime configuration is missing. Configure window.__APP_CONFIG__ before launching the app in production.');
  }

  return runtimeConfig;
}
