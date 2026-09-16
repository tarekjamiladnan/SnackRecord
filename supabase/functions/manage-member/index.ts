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

  const deleteMember = async (memberId: string) => {
    const { data: member, error: memberError } = await adminClient
      .from('members')
      .select('id, user_id, name, email')
      .eq('id', memberId)
      .eq('team_id', actor.team_id)
      .maybeSingle();
    if (memberError) throw memberError;
    if (!member) return json({ error: 'Member not found' }, 404);
    if (member.user_id === actor.id) return json({ error: 'You cannot delete your own account' }, 400);

    // Archive first so payment history is kept, then remove the auth account so
    // nothing lingers under Authentication and the member loses sign-in access.
    // Deleting the auth user cascades the profile and unlinks members.user_id.
    const { error: archiveError } = await adminClient
      .from('members')
      .update({ status: 'archived' })
      .eq('id', member.id)
      .eq('team_id', actor.team_id);
    if (archiveError) throw archiveError;

    if (member.user_id) {
      const { error: userError } = await adminClient.auth.admin.deleteUser(member.user_id);
      if (userError) throw userError;
    }
    return json({ member: { ...member, user_id: null, status: 'archived' } });
  };

  try {
    const body = await request.json();
    const action = body.action ? String(body.action) : 'create';
    const name = String(body.name ?? '').trim();
    const email = String(body.email ?? '').trim().toLowerCase();
    const phone = String(body.phone ?? '').trim() || null;
    const password = String(body.password ?? '');
    const memberId = body.memberId ? String(body.memberId) : null;

    if (action === 'delete') {
      if (!memberId) return json({ error: 'memberId is required' }, 400);
      return deleteMember(memberId);
    }

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

    // ---- Adding a member. Handle every leftover state so a previously deleted
    // ---- member can be added again without hitting the auth account or the
    // ---- unique (team_id, email) constraint.
    const { data: existingMember, error: lookupError } = await adminClient
      .from('members')
      .select('id, user_id, status')
      .eq('team_id', actor.team_id)
      .ilike('email', email)
      .maybeSingle();
    if (lookupError) throw lookupError;

    // Re-use the existing auth account for this email when it belongs to this team.
    let userId = existingMember?.user_id ?? null;
    const { data: authList, error: authListError } = await adminClient.auth.admin.listUsers({ filter: email });
    if (authListError) throw authListError;
    const existingUser = (authList?.users ?? []).find((u) => u.email?.toLowerCase() === email) ?? null;
    if (existingUser) {
      const { data: profile, error: profileLookupError } = await adminClient
        .from('profiles')
        .select('id, team_id')
        .eq('id', existingUser.id)
        .maybeSingle();
      if (profileLookupError) throw profileLookupError;
      if (profile && profile.team_id !== actor.team_id) {
        return json({ error: `Email ${email} is already registered to another team` }, 409);
      }
      userId = existingUser.id;
    } else if (existingMember?.user_id) {
      // The linked account no longer exists (deleted from the dashboard), so a
      // fresh account must be created.
      userId = null;
    }

    if (!userId) {
      const { data: createdAuth, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name }
      });
      if (createError || !createdAuth.user) throw createError ?? new Error('Could not create account');
      userId = createdAuth.user.id;
    } else if (password) {
      const { error: passwordError } = await adminClient.auth.admin.updateUserById(userId, { password, email_confirm: true });
      if (passwordError) throw passwordError;
    }

    if (existingMember) {
      // Re-add: re-activate the same row and re-link the account.
      const { data: member, error: reactivateError } = await adminClient
        .from('members')
        .update({ user_id: userId, name, email, phone, status: 'active' })
        .eq('id', existingMember.id)
        .eq('team_id', actor.team_id)
        .select()
        .single();
      if (reactivateError) throw reactivateError;
      const { error: profileError } = await adminClient.from('profiles').upsert(
        { id: userId, team_id: actor.team_id, name, email, phone, role: 'MEMBER' },
        { onConflict: 'id' }
      );
      if (profileError) throw profileError;
      return json({ member });
    }

    const { data: member, error: memberError } = await adminClient.from('members').insert({
      team_id: actor.team_id,
      user_id: userId,
      name,
      email,
      phone,
      status: 'active'
    }).select().single();
    if (memberError) {
      if (!existingUser) await adminClient.auth.admin.deleteUser(userId).catch(() => {});
      throw memberError;
    }
    const { error: profileError } = await adminClient.from('profiles').insert({
      id: userId,
      team_id: actor.team_id,
      name,
      email,
      phone,
      role: 'MEMBER'
    });
    if (profileError) {
      await adminClient.from('members').delete().eq('id', member.id);
      if (!existingUser) await adminClient.auth.admin.deleteUser(userId).catch(() => {});
      throw profileError;
    }
    return json({ member }, 201);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Member operation failed' }, 400);
  }
});