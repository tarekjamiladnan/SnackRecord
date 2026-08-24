-- In-app notifications:
-- 1) Member submits an order        -> every TEAM_ADMIN of the team is notified
-- 2) Member requests late-order     -> every TEAM_ADMIN of the team is notified
--    permission
-- 3) Admin approves/rejects the     -> requesting member is notified
--    request
--
-- Delivery happens through triggers so it works no matter how the row was
-- written (RPC, direct table write, future admin tooling, ...).

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  recipient_user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in (
    'order_submitted',
    'order_permission_requested',
    'order_permission_approved',
    'order_permission_rejected'
  )),
  title text not null,
  body text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_recipient_idx on public.notifications(recipient_user_id, created_at desc);
create index notifications_team_idx on public.notifications(team_id);

alter table public.notifications enable row level security;

create policy notifications_own_read on public.notifications for select
  using (recipient_user_id = auth.uid());
create policy notifications_own_mark_read on public.notifications for update
  using (recipient_user_id = auth.uid())
  with check (recipient_user_id = auth.uid());

-- Inserts/deletes only happen server-side via security definer code below;
-- clients never insert notifications directly.

create or replace function public.notify_team_admins(
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
  where p.team_id = p_team_id and p.role = 'TEAM_ADMIN'
    and (auth.uid() is null or p.id <> auth.uid())
$$;

revoke all on function public.notify_team_admins(uuid, text, text, text) from public;

-- 1) New order placed by a member -> notify the admins
create or replace function public.orders_notify_admins()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  member_name text;
begin
  select m.name into member_name from public.members m where m.id = new.member_id;
  perform public.notify_team_admins(
    new.team_id,
    'order_submitted',
    coalesce(member_name, 'A member') || ' placed an order',
    coalesce(member_name, 'A member') || ' submitted an order for ' || to_char(new.order_date, 'YYYY-MM-DD') ||
      case when new.order_text is not null and length(trim(new.order_text)) > 0
        then ': ' || left(new.order_text, 120) else '' end
  );
  return new;
end;
$$;

create trigger orders_notify_admins_trigger
after insert on public.orders
for each row execute function public.orders_notify_admins();

-- 2) Permission requested / re-requested -> notify the admins.
--    Re-requests while already pending are ignored to avoid spam.
create or replace function public.order_requests_notify_admins()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  member_name text;
begin
  if new.status <> 'pending' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'pending' then return new; end if;
  select m.name into member_name from public.members m where m.id = new.member_id;
  perform public.notify_team_admins(
    new.team_id,
    'order_permission_requested',
    coalesce(member_name, 'A member') || ' requests order permission',
    coalesce(member_name, 'A member') || ' asked for permission to place a late order for ' ||
      to_char(new.request_date, 'YYYY-MM-DD') || '.'
  );
  return new;
end;
$$;

create trigger order_requests_notify_admins_trigger
after insert or update of status on public.order_requests
for each row execute function public.order_requests_notify_admins();

-- 3) Request approved/rejected -> notify the requesting member
create or replace function public.order_requests_notify_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  member_user uuid;
begin
  if tg_op <> 'UPDATE' then return new; end if;
  if old.status <> 'pending' or new.status not in ('approved', 'rejected') then return new; end if;
  select user_id into member_user from public.members m where m.id = new.member_id;
  if member_user is null then return new; end if;
  if auth.uid() is not null and member_user = auth.uid() then return new; end if;
  insert into public.notifications(team_id, recipient_user_id, type, title, body)
  values (
    new.team_id,
    member_user,
    case when new.status = 'approved' then 'order_permission_approved' else 'order_permission_rejected' end,
    case when new.status = 'approved' then 'Order permission granted' else 'Order permission denied' end,
    case when new.status = 'approved'
      then 'The admin granted you permission to place your order for ' || to_char(new.request_date, 'YYYY-MM-DD') || '.'
      else 'The admin declined your request to place a late order for ' || to_char(new.request_date, 'YYYY-MM-DD') || '.'
    end
  );
  return new;
end;
$$;

create trigger order_requests_notify_member_trigger
after update of status on public.order_requests
for each row execute function public.order_requests_notify_member();

-- Live updates for the bell icon (non-fatal: polling covers delivery if this fails)
do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception
  when duplicate_object then null; -- already added
  when others then
    raise warning 'Could not add notifications to supabase_realtime publication: %', sqlerrm;
end $$;
