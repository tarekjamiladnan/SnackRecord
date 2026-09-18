-- Event attendance: every team member can mark themselves GOING or NOT_GOING
-- on an event. Totals are surfaced through an RPC the app calls per page.

create type public.event_attendance_status as enum ('GOING', 'NOT_GOING');

create table public.event_attendees (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  member_id uuid not null references public.profiles(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  status public.event_attendance_status not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, member_id)
);

create index event_attendees_event_idx on public.event_attendees(event_id);
create index event_attendees_team_idx on public.event_attendees(team_id);

alter table public.event_attendees enable row level security;

create policy event_attendees_team_read on public.event_attendees for select
  using (team_id = public.current_team_id());
create policy event_attendees_member_write on public.event_attendees for all
  using (team_id = public.current_team_id() and member_id = auth.uid())
  with check (team_id = public.current_team_id() and member_id = auth.uid());

create trigger event_attendees_updated_at before update on public.event_attendees
for each row execute function public.set_updated_at();

-- Per-event GOING/NOT_GOING totals plus the current user's own status,
-- for a batch of event ids (returns zero rows for events with no attendees).
create or replace function public.event_attendance(p_event_ids uuid[])
returns table (event_id uuid, going_count bigint, not_going_count bigint, my_status public.event_attendance_status)
language sql stable security definer set search_path = public as $$
  select
    a.event_id,
    count(*) filter (where a.status = 'GOING')::bigint as going_count,
    count(*) filter (where a.status = 'NOT_GOING')::bigint as not_going_count,
    (array_agg(a.status) filter (where a.member_id = auth.uid()))[1] as my_status
  from public.event_attendees a
  join public.events e on e.id = a.event_id
  where e.team_id = public.current_team_id()
    and a.event_id = any(p_event_ids)
  group by a.event_id;
$$;

-- Set my own attendance on an event. Passing NULL removes my attendance.
create or replace function public.set_event_attendance(p_event_id uuid, p_status public.event_attendance_status)
returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.events where id = p_event_id and team_id = public.current_team_id()) then
    if p_status is null then
      delete from public.event_attendees
      where event_id = p_event_id and member_id = auth.uid();
    else
      insert into public.event_attendees(event_id, member_id, team_id, status)
      values (p_event_id, auth.uid(), public.current_team_id(), p_status)
      on conflict (event_id, member_id)
      do update set status = excluded.status, team_id = excluded.team_id;
    end if;
  else
    raise exception 'Event not found';
  end if;
end;
$$;

revoke all on function public.event_attendance(uuid[]) from public;
revoke all on function public.set_event_attendance(uuid, public.event_attendance_status) from public;
grant execute on function public.event_attendance(uuid[]) to authenticated;
grant execute on function public.set_event_attendance(uuid, public.event_attendance_status) to authenticated;