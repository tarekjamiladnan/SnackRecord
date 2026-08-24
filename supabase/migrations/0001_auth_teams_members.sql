create extension if not exists pgcrypto;

create type public.app_role as enum ('SUPER_ADMIN', 'TEAM_ADMIN', 'MEMBER');
create type public.team_status as enum ('PENDING', 'ACTIVE', 'SUSPENDED', 'REJECTED', 'DELETED');

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  status public.team_status not null default 'PENDING',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  team_id uuid references public.teams(id) on delete set null,
  name text not null,
  email text not null unique,
  phone text,
  role public.app_role not null default 'MEMBER',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid unique references auth.users(id) on delete set null,
  name text not null,
  email text,
  phone text,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  unique (team_id, email)
);

create index profiles_team_id_idx on public.profiles(team_id);
create index members_team_id_status_idx on public.members(team_id, status);

create or replace function public.current_team_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.team_id from public.profiles p
  left join public.teams t on t.id = p.team_id
  where p.id = auth.uid() and t.status = 'ACTIVE'
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'SUPER_ADMIN'
  )
$$;

create or replace function public.current_user_context()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', p.id,
    'team_id', p.team_id,
    'name', p.name,
    'email', p.email,
    'phone', p.phone,
    'role', p.role,
    'team', case when t.id is null then null else jsonb_build_object('id', t.id, 'name', t.name, 'status', t.status) end
  )
  from public.profiles p
  left join public.teams t on t.id = p.team_id
  where p.id = auth.uid()
$$;

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
    raise exception 'Team name, admin name and email are required';
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
    team_slug := team_slug || '-' || floor(random() * 100000)::int;
  end loop;

  insert into public.teams(name, slug, status)
  values (trim(team_name), team_slug, 'PENDING')
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

alter table public.teams enable row level security;
alter table public.profiles enable row level security;
alter table public.members enable row level security;

create policy teams_super_admin_all on public.teams for all using (public.is_super_admin()) with check (public.is_super_admin());
create policy teams_member_read on public.teams for select using (id = public.current_team_id() and status = 'ACTIVE');

create policy profiles_super_admin_all on public.profiles for all using (public.is_super_admin()) with check (public.is_super_admin());
create policy profiles_same_team_read on public.profiles for select using (team_id = public.current_team_id());

create policy members_super_admin_all on public.members for all using (public.is_super_admin()) with check (public.is_super_admin());
create policy members_same_team_read on public.members for select using (team_id = public.current_team_id());
create policy members_same_team_insert on public.members for insert
  with check (team_id = public.current_team_id() and exists (
    select 1 from public.profiles where id = auth.uid() and role = 'TEAM_ADMIN'
  ));
create policy members_admin_update on public.members for update
  using (team_id = public.current_team_id() and exists (
    select 1 from public.profiles where id = auth.uid() and role = 'TEAM_ADMIN'
  ))
  with check (team_id = public.current_team_id());

revoke all on function public.register_team_request(text, text, text, text) from public;
grant execute on function public.register_team_request(text, text, text, text) to authenticated;
grant execute on function public.current_user_context() to authenticated;

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger teams_updated_at before update on public.teams
for each row execute function public.set_updated_at();
create trigger profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();