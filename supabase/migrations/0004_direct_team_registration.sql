update public.teams set status = 'ACTIVE' where status = 'PENDING';

create or replace function public.register_team_request(
  team_name text,
  admin_name text,
  admin_email text,
  admin_phone text default null
)
returns public.teams
language plpgsql
security definer
set search_path = public
as $$
declare
  created_team public.teams;
  normalized_email text := lower(trim(admin_email));
  base_slug text := regexp_replace(lower(trim(team_name)), '[^a-z0-9]+', '-', 'g');
  team_slug text := trim(both '-' from base_slug);
begin
  if auth.uid() is null then raise exception 'Authentication is required'; end if;
  if trim(team_name) = '' or trim(admin_name) = '' or normalized_email = '' then
    raise exception 'Team name, admin name and admin email are required';
  end if;
  if normalized_email <> lower(coalesce(auth.jwt() ->> 'email', '')) then
    raise exception 'The registration email must match the authenticated account';
  end if;
  if exists (select 1 from public.profiles where id = auth.uid() and team_id is not null) then
    raise exception 'This account already belongs to a team';
  end if;
  if exists (select 1 from public.profiles where email = normalized_email and id <> auth.uid()) then
    raise exception 'An account already exists with that email';
  end if;
  if team_slug = '' then team_slug := 'team'; end if;
  while exists (select 1 from public.teams where slug = team_slug) loop
    team_slug := left(team_slug, 50) || '-' || floor(random() * 100000)::int;
  end loop;

  insert into public.teams(name, slug, status)
  values (trim(team_name), team_slug, 'ACTIVE')
  returning * into created_team;
  insert into public.profiles(id, team_id, name, email, phone, role)
  values (auth.uid(), created_team.id, trim(admin_name), normalized_email, nullif(trim(admin_phone), ''), 'TEAM_ADMIN')
  on conflict (id) do update set team_id = excluded.team_id, name = excluded.name,
    email = excluded.email, phone = excluded.phone, role = excluded.role;
  insert into public.members(team_id, user_id, name, email, phone)
  values (created_team.id, auth.uid(), trim(admin_name), normalized_email, nullif(trim(admin_phone), ''));
  insert into public.team_settings(team_id) values (created_team.id);
  return created_team;
end;
$$;

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
  select t.* into created_team from public.teams t join public.profiles p on p.team_id = t.id where p.id = p_user_id;
  if created_team.id is not null then return created_team; end if;
  if team_name = '' or admin_name = '' or normalized_email = '' then return null; end if;
  if team_slug = '' then team_slug := 'team'; end if;
  while exists (select 1 from public.teams where slug = team_slug) loop
    team_slug := left(team_slug, 50) || '-' || floor(random() * 100000)::int;
  end loop;
  insert into public.teams(name, slug, status) values (team_name, team_slug, 'ACTIVE') returning * into created_team;
  insert into public.profiles(id, team_id, name, email, phone, role)
  values (p_user_id, created_team.id, admin_name, normalized_email, admin_phone, 'TEAM_ADMIN');
  insert into public.members(team_id, user_id, name, email, phone)
  values (created_team.id, p_user_id, admin_name, normalized_email, admin_phone);
  insert into public.team_settings(team_id) values (created_team.id);
  return created_team;
end;
$$;
