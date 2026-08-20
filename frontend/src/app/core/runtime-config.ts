import { environment } from '../../environments/environment';

declare global {
  interface Window {
    __APP_CONFIG__?: {
      apiUrl?: string;
      appName?: string;
    };
  }
}

export interface RuntimeConfig {
  apiUrl: string;
  appName: string;
}

export function getRuntimeConfig(): RuntimeConfig {
  const config = window.__APP_CONFIG__ ?? {};
  const runtimeConfig: RuntimeConfig = {
    apiUrl: (config.apiUrl ?? environment.apiUrl ?? 'http://localhost:3000/api').trim() || 'http://localhost:3000/api',
    appName: (config.appName ?? environment.appName ?? 'Phantom Snack Record').trim() || 'Phantom Snack Record'
  };

  if (!runtimeConfig.apiUrl) {
    console.warn('API URL is missing. Configure window.__APP_CONFIG__.apiUrl or environment.apiUrl.');
  }

  return runtimeConfig;
}
