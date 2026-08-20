import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const apiUrl = (process.env.NG_APP_API_URL || process.env.API_URL || 'http://localhost:5000/api').trim();
const appName = (process.env.APP_NAME || 'Phantom Snack Record').trim() || 'Phantom Snack Record';

const content = `window.__APP_CONFIG__ = {\n  appName: ${JSON.stringify(appName)},\n  apiUrl: ${JSON.stringify(apiUrl)}\n};\n`;

const target = path.join(process.cwd(), 'public', 'app-config.js');
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, content, 'utf8');
console.log(`App config written to ${target} (apiUrl=${apiUrl})`);