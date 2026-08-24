import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const pickUrl = (value) => {
  const text = String(value).trim();
  let url = '';
  let cursor = 0;
  for (;;) {
    const i = text.indexOf('https://', cursor);
    const j = text.indexOf('http://', cursor);
    const start = i === -1 ? j : j === -1 ? i : Math.min(i, j);
    if (start === -1) break;
    cursor = start + 1;
    let end = start;
    while (end < text.length && !/[\s"'`,]/.test(text[end])) end++;
    const candidate = text.slice(start, end).replace(/\/+$/, '');
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') url = candidate;
    } catch { /* ignore malformed candidates */ }
  }
  return url;
};

const supabaseUrl = pickUrl(process.env.NG_APP_SUPABASE_URL || process.env.SUPABASE_URL || '');
const supabaseAnonKey = String(process.env.NG_APP_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '').trim();
const appName = (process.env.APP_NAME || 'Phantom Snack Record').trim() || 'Phantom Snack Record';

// Preserve a previously generated vapidPublicKey when the env var is absent,
// so redeploys cannot silently disable push notifications.
const existingVapidKey = (() => {
  try {
    const match = /vapidPublicKey["']?\s*:\s*["']([^"']*)["']/.exec(
      fs.readFileSync(path.join(process.cwd(), 'public', 'app-config.js'), 'utf8')
    );
    return match?.[1] ?? '';
  } catch {
    return '';
  }
})();
const vapidPublicKey = String(process.env.NG_APP_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY || existingVapidKey).trim();

const content = `window.__APP_CONFIG__ = {\n  appName: ${JSON.stringify(appName)},\n  supabaseUrl: ${JSON.stringify(supabaseUrl)},\n  supabaseAnonKey: ${JSON.stringify(supabaseAnonKey)},\n  vapidPublicKey: ${JSON.stringify(vapidPublicKey)}\n};\n`;

const target = path.join(process.cwd(), 'public', 'app-config.js');
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, content, 'utf8');
console.log(`App config written to ${target} (supabaseUrl=${supabaseUrl})`);