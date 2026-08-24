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

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = request.headers.get('Authorization');
  if (!supabaseUrl || !serviceRoleKey || !authorization) return json({ error: 'Configuration or authentication missing' }, 401);

  const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? serviceRoleKey, {
    global: { headers: { Authorization: authorization } }
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) return json({ error: 'Authentication required' }, 401);

  const { data: actor, error: actorError } = await userClient
    .from('profiles')
    .select('id, team_id, role')
    .eq('id', authData.user.id)
    .single();
  if (actorError || !actor?.team_id || !['TEAM_ADMIN', 'SUPER_ADMIN'].includes(actor.role)) {
    return json({ error: 'Team admin access required' }, 403);
  }

  try {
    const body = await request.json();
    const name = String(body.name ?? '').trim();
    const email = String(body.email ?? '').trim().toLowerCase();
    const phone = String(body.phone ?? '').trim() || null;
    const password = String(body.password ?? '');
    const memberId = body.memberId ? String(body.memberId) : null;
    if (!name || !email || (!memberId && password.length < 6) || (memberId && password && password.length < 6)) {
      return json({ error: 'Name, email and a six-character password are required' }, 400);
    }

    if (memberId) {
      const { data: member, error } = await adminClient.from('members').update({ name, email, phone }).eq('id', memberId).eq('team_id', actor.team_id).select().single();
      if (error) throw error;
      if (password && member.user_id) {
        const { error: passwordError } = await adminClient.auth.admin.updateUserById(member.user_id, { password });
        if (passwordError) throw passwordError;
      }
      return json({ member });
    }

    const { data: createdAuth, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name }
    });
    if (createError || !createdAuth.user) throw createError ?? new Error('Could not create account');

    const { data: member, error: memberError } = await adminClient.from('members').insert({
      team_id: actor.team_id,
      user_id: createdAuth.user.id,
      name,
      email,
      phone,
      status: 'active'
    }).select().single();
    if (memberError) {
      await adminClient.auth.admin.deleteUser(createdAuth.user.id);
      throw memberError;
    }
    const { error: profileError } = await adminClient.from('profiles').insert({
      id: createdAuth.user.id,
      team_id: actor.team_id,
      name,
      email,
      phone,
      role: 'MEMBER'
    });
    if (profileError) {
      await adminClient.from('members').delete().eq('id', member.id);
      await adminClient.auth.admin.deleteUser(createdAuth.user.id);
      throw profileError;
    }
    return json({ member }, 201);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Member operation failed' }, 400);
  }
});