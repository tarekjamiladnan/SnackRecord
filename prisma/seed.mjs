import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'node:fs';

if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=['"]?(.*?)['"]?$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) {
  throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env before seeding Auth users.');
}

const supabase = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

const accounts = [
  { email: 'adnan@gmail.com', password: 'adnan123', fullName: 'Adnan', role: 'admin', member: 'Adnan Khan', phone: '01700000000' },
  { email: 'admin@gmail.com', password: 'adnan123', fullName: 'Admin', role: 'admin', member: 'Admin User', phone: '01700000002' },
  { email: 'user@gmail.com', password: 'adnan123', fullName: 'Default User', role: 'user', member: 'Default User', phone: '01700000001' }
];

async function findUserId(email) {
  const { data, error } = await supabase.auth.admin.listUsers();
  if (error) throw error;
  return data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase())?.id;
}

async function upsertAuthUser(account) {
  const existingId = await findUserId(account.email);
  if (existingId) {
    const { error } = await supabase.auth.admin.updateUserById(existingId, {
      password: account.password,
      email_confirm: true,
      user_metadata: { full_name: account.fullName, role: account.role }
    });
    if (error) throw error;
    return existingId;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email: account.email,
    password: account.password,
    email_confirm: true,
    user_metadata: { full_name: account.fullName, role: account.role }
  });
  if (error) throw error;
  return data.user.id;
}

for (const account of accounts) {
  const id = await upsertAuthUser(account);
  await supabase.from('profiles').upsert({ id, email: account.email, full_name: account.fullName, role: account.role });
  await supabase.from('members').upsert(
    { user_id: id, name: account.member, email: account.email, phone: account.phone, status: 'active' },
    { onConflict: 'email' }
  );
}

await supabase.from('settings').upsert({ id: 1, company_name: 'Phantom Snack Record', currency: 'BDT', manager_name: 'Adnan' });
await supabase.from('menus').upsert([{ name: 'Tea', price: 10 }, { name: 'Coffee', price: 20 }, { name: 'Singara', price: 12 }, { name: 'Cake', price: 30 }], { onConflict: 'name' });
await supabase.from('months').upsert({ year: 2026, month: 8, opening_cash: 0, closing_cash: 0, status: 'open' }, { onConflict: 'year,month' });

console.log('Seed complete: adnan@gmail.com, admin@gmail.com, user@gmail.com / adnan123');
