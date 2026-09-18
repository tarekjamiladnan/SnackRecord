-- Restructure: points attach directly to events (no steps level).
-- Adds an approximate budget column to events, moves points from their
-- step onto the event, and drops the now-unused event_steps table.

alter table public.events
  add column if not exists approximate_budget numeric(12, 2);

alter table public.event_points
  add column if not exists event_id uuid references public.events(id) on delete cascade;

update public.event_points ep
  set event_id = es.event_id
  from public.event_steps es
  where ep.step_id = es.id;

alter table public.event_points
  alter column event_id set not null;

alter table public.event_points
  drop column if exists date,
  drop column if exists step_id;

drop table if exists public.event_steps;

drop index if exists event_points_step_idx;
create index event_points_event_idx on public.event_points(event_id, position);

-- Reordering now works per event instead of per step.
-- Postgres cannot rename parameters via CREATE OR REPLACE, so drop first.
drop function if exists public.reorder_event_steps(uuid, uuid[]);
drop function if exists public.reorder_event_points(uuid, uuid[]);

create or replace function public.reorder_event_points(p_event_id uuid, p_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare
  idx integer := 0;
  point_id uuid;
begin
  if not public.is_team_admin() then raise exception 'Team admin access required'; end if;
  if not exists (select 1 from public.events where id = p_event_id and team_id = public.current_team_id()) then
    raise exception 'Event not found';
  end if;
  foreach point_id in array p_ids loop
    update public.event_points set position = idx where id = point_id and event_id = p_event_id;
    idx := idx + 1;
  end loop;
end;
$$;

revoke all on function public.reorder_event_points(uuid, uuid[]) from public;
grant execute on function public.reorder_event_points(uuid, uuid[]) to authenticated;