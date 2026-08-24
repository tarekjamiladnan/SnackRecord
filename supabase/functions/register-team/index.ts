import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceRoleKey) return json({ error: 'Registration service is not configured' }, 500);

  try {
    const body = await request.json();
    const teamName = String(body.teamName ?? '').trim();
    const adminName = String(body.adminName ?? '').trim();
    const email = String(body.email ?? '').trim().toLowerCase();
    const phone = String(body.phone ?? '').trim() || null;
    const password = String(body.password ?? '');
    if (!teamName || !adminName || !email || password.length < 8) {
      return json({ error: 'Team name, admin name, email, and an eight-character password are required' }, 400);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'A valid email is required' }, 400);

    const admin = createClient(url, serviceRoleKey);
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { teamName, adminName, phone }
    });
    if (error || !data.user) return json({ error: error?.message ?? 'Could not create account' }, 400);

    return json({ userId: data.user.id, message: 'Account and team created successfully.' }, 201);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Registration failed' }, 400);
  }
});
