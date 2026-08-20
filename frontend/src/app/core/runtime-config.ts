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

const pickUrl = (value: string): string => {
  const text = String(value).trim();
  let url = '';
  let cursor = 0;
  for (;;) {
    const httpIndex = text.indexOf('https://', cursor);
    const httpsIndex = text.indexOf('http://', cursor);
    const start = httpIndex === -1 ? httpsIndex : httpsIndex === -1 ? httpIndex : Math.min(httpIndex, httpsIndex);
    if (start === -1) break;
    cursor = start + 1;
    let end = start;
    while (end < text.length && !/[\s"'`,]/.test(text[end])) end++;
    const candidate = text.slice(start, end).replace(/\/+$/, '');
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') url = candidate;
    } catch {
      // ignore malformed candidates
    }
  }
  return url;
};

export function getRuntimeConfig(): RuntimeConfig {
  const config = window.__APP_CONFIG__ ?? {};
  const runtimeConfig: RuntimeConfig = {
    apiUrl: pickUrl(config.apiUrl ?? environment.apiUrl ?? 'http://localhost:3000/api') || 'http://localhost:5000/api',
    appName: (config.appName ?? environment.appName ?? 'Phantom Snack Record').trim() || 'Phantom Snack Record'
  };

  if (!runtimeConfig.apiUrl) {
    console.warn('API URL is missing. Configure window.__APP_CONFIG__.apiUrl or environment.apiUrl.');
  }

  return runtimeConfig;
}
