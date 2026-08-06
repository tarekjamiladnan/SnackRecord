import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before seeding.');

const supabase = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

const { data: userResult, error: userError } = await supabase.auth.admin.createUser({
  email: 'adnan@gmail.com',
  password: 'adnan123',
  email_confirm: true,
  user_metadata: { full_name: 'Adnan' }
});
if (userError && !userError.message.includes('already')) throw userError;

const userId = userResult?.user?.id ?? (await supabase.auth.admin.listUsers()).data.users.find((u) => u.email === 'adnan@gmail.com')?.id;
if (!userId) throw new Error('Admin user was not created.');

await supabase.from('profiles').upsert({ id: userId, email: 'adnan@gmail.com', full_name: 'Adnan', role: 'admin' });
await supabase.from('settings').upsert({ id: 1, company_name: 'Phantom Snack Record', currency: 'BDT', manager_name: 'Adnan' });
await supabase.from('menus').upsert([{ name: 'Tea', price: 10 }, { name: 'Coffee', price: 20 }, { name: 'Singara', price: 12 }, { name: 'Cake', price: 30 }], { onConflict: 'name' });
await supabase.from('members').insert([{ name: 'Adnan Khan', phone: '01700000000' }, { name: 'Team Member', phone: '01700000001' }]);
await supabase.from('months').upsert({ year: 2026, month: 8, opening_cash: 0, closing_cash: 0, status: 'open' }, { onConflict: 'year,month' });

console.log('Seed complete: adnan@gmail.com / adnan123');
