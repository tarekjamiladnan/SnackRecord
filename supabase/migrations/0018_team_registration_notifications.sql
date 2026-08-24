-- Notify every SUPER_ADMIN when a new team registers.
-- Registration always ends with an insert into public.teams (either the
-- on_auth_user_created trigger path or the register_team_request RPC), so a
-- trigger on teams covers every path, matching the approach of 0016.

alter table public.notifications drop constraint notifications_type_check;

alter table public.notifications add constraint notifications_type_check
  check (type in (
    'order_submitted',
    'order_permission_requested',
    'order_permission_approved',
    'order_permission_rejected',
    'team_registered'
  ));

create or replace function public.notify_super_admins(
  p_team_id uuid,
  p_type text,
  p_title text,
  p_body text
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.notifications(team_id, recipient_user_id, type, title, body)
  select p_team_id, p.id, p_type, p_title, p_body
  from public.profiles p
  where p.role = 'SUPER_ADMIN'
    and (auth.uid() is null or p.id <> auth.uid())
$$;

revoke all on function public.notify_super_admins(uuid, text, text, text) from public;

-- Deferred so it fires at commit time, when the team admin profile already
-- exists and can be named in the message (registration inserts the profile
-- right after the team row within the same transaction).
create or replace function public.teams_notify_super_admins()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_name text;
begin
  select p.name into admin_name
  from public.profiles p
  where p.team_id = new.id and p.role = 'TEAM_ADMIN'
  order by p.created_at
  limit 1;
  perform public.notify_super_admins(
    new.id,
    'team_registered',
    'New team registered',
    coalesce(admin_name, 'The team admin') || ' registered "' || new.name ||
      '". Review it under Registered Teams.'
  );
  return new;
end;
$$;

create constraint trigger teams_notify_super_admins_trigger
after insert on public.teams
deferrable initially deferred
for each row execute function public.teams_notify_super_admins();
