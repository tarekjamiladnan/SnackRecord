-- Richer diagnostics: dump every profile row so unlinked accounts are visible.
create or replace function public.debug_member_access()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return jsonb_build_object(
    'teams', (
      select coalesce(json_agg(json_build_object('id', id, 'name', name, 'status', status)), '[]'::json)
      from public.teams
    ),
    'profiles', (
      select coalesce(json_agg(json_build_object(
        'id', id,
        'email', email,
        'name', name,
        'role', role,
        'team_id', team_id
      )), '[]'::json)
      from public.profiles
    ),
    'members', (
      select coalesce(json_agg(json_build_object(
        'id', id,
        'email', email,
        'name', name,
        'status', status,
        'team_id', team_id,
        'user_id', user_id
      )), '[]'::json)
      from public.members
    )
  );
end;
$$;
