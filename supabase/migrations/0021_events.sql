-- Events, Event Steps and Event Points
-- Event -> EventStep -> EventPoint (all fully dynamic: any number of steps,
-- any number of points per step). Every table is team-scoped to match the
-- existing RLS conventions in this project.

create table public.events (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  description text,
  date date,
  start_time time,
  end_time time,
  location text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.event_steps (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  description text,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.event_points (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  step_id uuid not null references public.event_steps(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 120),
  description text,
  time time,
  location text,
  icon text not null default 'location' check (icon in (
    'location', 'car', 'plane', 'ship', 'bus', 'train', 'bed', 'coffee',
    'camera', 'party', 'music', 'footprints', 'mountain', 'sun', 'flag',
    'gamepad', 'dumbbell', 'film', 'waves', 'sandwich', 'cake', 'landmark',
    'tent', 'palette', 'utensils', 'sparkles', 'moon', 'clock'
  )),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index events_team_idx on public.events(team_id);
create index event_steps_event_idx on public.event_steps(event_id, position);
create index event_points_step_idx on public.event_points(step_id, position);

alter table public.events enable row level security;
alter table public.event_steps enable row level security;
alter table public.event_points enable row level security;

create policy events_team_read on public.events for select using (team_id = public.current_team_id());
create policy events_admin_write on public.events for all
  using (team_id = public.current_team_id() and public.is_team_admin())
  with check (team_id = public.current_team_id() and public.is_team_admin());

create policy event_steps_team_read on public.event_steps for select using (team_id = public.current_team_id());
create policy event_steps_admin_write on public.event_steps for all
  using (team_id = public.current_team_id() and public.is_team_admin())
  with check (team_id = public.current_team_id() and public.is_team_admin());

create policy event_points_team_read on public.event_points for select using (team_id = public.current_team_id());
create policy event_points_admin_write on public.event_points for all
  using (team_id = public.current_team_id() and public.is_team_admin())
  with check (team_id = public.current_team_id() and public.is_team_admin());

create trigger events_updated_at before update on public.events
for each row execute function public.set_updated_at();
create trigger event_steps_updated_at before update on public.event_steps
for each row execute function public.set_updated_at();
create trigger event_points_updated_at before update on public.event_points
for each row execute function public.set_updated_at();

-- Atomic reordering for steps and points. The full ordered id array is sent
-- from the client and each position is written back transactionally.
create or replace function public.reorder_event_steps(p_event_id uuid, p_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare
  idx integer := 0;
  step_id uuid;
begin
  if not public.is_team_admin() then raise exception 'Team admin access required'; end if;
  if not exists (select 1 from public.events where id = p_event_id and team_id = public.current_team_id()) then
    raise exception 'Event not found';
  end if;
  foreach step_id in array p_ids loop
    update public.event_steps set position = idx where id = step_id and event_id = p_event_id;
    idx := idx + 1;
  end loop;
end;
$$;

create or replace function public.reorder_event_points(p_step_id uuid, p_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare
  idx integer := 0;
  point_id uuid;
begin
  if not public.is_team_admin() then raise exception 'Team admin access required'; end if;
  if not exists (select 1 from public.event_steps where id = p_step_id and team_id = public.current_team_id()) then
    raise exception 'Step not found';
  end if;
  foreach point_id in array p_ids loop
    update public.event_points set position = idx where id = point_id and step_id = p_step_id;
    idx := idx + 1;
  end loop;
end;
$$;

revoke all on function public.reorder_event_steps(uuid, uuid[]) from public;
revoke all on function public.reorder_event_points(uuid, uuid[]) from public;
grant execute on function public.reorder_event_steps(uuid, uuid[]), public.reorder_event_points(uuid, uuid[]) to authenticated;