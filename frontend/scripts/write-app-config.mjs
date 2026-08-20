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

const apiUrl = pickUrl(process.env.NG_APP_API_URL || process.env.API_URL || 'http://localhost:5000/api') || 'http://localhost:5000/api';
const appName = (process.env.APP_NAME || 'Phantom Snack Record').trim() || 'Phantom Snack Record';

const content = `window.__APP_CONFIG__ = {\n  appName: ${JSON.stringify(appName)},\n  apiUrl: ${JSON.stringify(apiUrl)}\n};\n`;

const target = path.join(process.cwd(), 'public', 'app-config.js');
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, content, 'utf8');
console.log(`App config written to ${target} (apiUrl=${apiUrl})`);