-- Team registration failed with GoTrue's generic "Database error creating new user".
-- Root cause: create_registration_context inserted the admin profile, which fired the
-- on_profile_sync_members trigger (migration 0011) that already created the members row.
-- The explicit members insert right after it then violated the unique members_user_id_key,
-- aborting the entire transaction including the auth.users insert.

create or replace function public.create_registration_context(
  p_user_id uuid,
  p_email text,
  p_metadata jsonb
)
returns public.teams
language plpgsql
security definer
set search_path = public
as $$
declare
  created_team public.teams;
  team_name text := trim(coalesce(p_metadata->>'teamName', ''));
  admin_name text := trim(coalesce(p_metadata->>'adminName', ''));
  admin_phone text := nullif(trim(coalesce(p_metadata->>'phone', '')), '');
  normalized_email text := lower(trim(p_email));
  base_slug text := regexp_replace(lower(team_name), '[^a-z0-9]+', '-', 'g');
  team_slug text := trim(both '-' from base_slug);
begin
  select t.* into created_team
  from public.teams t
  join public.profiles p on p.team_id = t.id
  where p.id = p_user_id;
  if created_team.id is not null then return created_team; end if;
  if team_name = '' or admin_name = '' or normalized_email = '' then return null; end if;
  if team_slug = '' then team_slug := 'team'; end if;
  while exists (select 1 from public.teams where slug = team_slug) loop
    team_slug := left(team_slug, 50) || '-' || floor(random() * 100000)::int;
  end loop;

  insert into public.teams(name, slug, status)
  values (team_name, team_slug, 'ACTIVE')
  returning * into created_team;
  insert into public.profiles(id, team_id, name, email, phone, role)
  values (p_user_id, created_team.id, admin_name, normalized_email, admin_phone, 'TEAM_ADMIN');
  -- on_profile_sync_members already created this row while inserting the profile
  -- above; only backfill it if that trigger did not run for any reason.
  insert into public.members(team_id, user_id, name, email, phone)
  values (created_team.id, p_user_id, admin_name, normalized_email, admin_phone)
  on conflict do nothing;
  insert into public.team_settings(team_id) values (created_team.id);
  return created_team;
end;
$$;
