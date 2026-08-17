import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const rootDir = process.cwd();
const targetPath = path.join(rootDir, 'public', 'app-config.js');

const supabaseUrl = (process.env.SUPABASE_URL ?? process.env.APP_SUPABASE_URL ?? '').trim();
const supabaseAnonKey = (process.env.SUPABASE_ANON_KEY ?? process.env.APP_SUPABASE_ANON_KEY ?? '').trim();
const appName = (process.env.APP_NAME ?? 'Phantom Snack Record').trim() || 'Phantom Snack Record';

const isCiLike = process.env.CI === 'true' || process.env.VERCEL === '1';
const hasRuntimeVars = Boolean(supabaseUrl && supabaseAnonKey);

if (!hasRuntimeVars && isCiLike) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY for deployment build. Configure both environment variables before building.');
}

if (!hasRuntimeVars && fs.existsSync(targetPath)) {
  console.log('Keeping existing public/app-config.js (no env vars provided).');
  process.exit(0);
}

const generated = `window.__APP_CONFIG__ = {\n  appName: ${JSON.stringify(appName)},\n  supabaseUrl: ${JSON.stringify(supabaseUrl)},\n  supabaseAnonKey: ${JSON.stringify(supabaseAnonKey)}\n};\n`;

fs.mkdirSync(path.dirname(targetPath), { recursive: true });
fs.writeFileSync(targetPath, generated, 'utf8');
console.log('Generated public/app-config.js from environment variables.');
