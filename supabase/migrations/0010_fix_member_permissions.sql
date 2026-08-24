-- Members must be able to request late-order permission regardless of how
-- their members row was created, and every member row belonging to a
-- signed-in user must be linked to that user.

-- 1) Link any still-unlinked members rows to their auth/profile account
update public.members m
set user_id = p.id
from public.profiles p
where m.user_id is null
  and m.team_id = p.team_id
  and lower(trim(coalesce(m.email, ''))) = lower(trim(p.email));

-- 2) Permission requests: key off team membership instead of requiring a
--    linked auth user on the members row. WITH CHECK keeps status = 'pending'
--    so nobody can approve their own request.
drop policy if exists order_requests_member_insert on public.order_requests;
create policy order_requests_member_insert on public.order_requests for insert
  with check (
    team_id = public.current_team_id()
    and exists (
      select 1 from public.members m
      where m.id = member_id and m.team_id = public.current_team_id()
    )
  );

drop policy if exists order_requests_member_update on public.order_requests;
create policy order_requests_member_update on public.order_requests for update
  using (team_id = public.current_team_id())
  with check (team_id = public.current_team_id() and status = 'pending');

-- 3) Server-side RPC for requesting late-order permission. Resolves the
--    caller's active member row via auth.uid() (falling back to the profile
--    email), and re-opens rejected/pending requests without touching approved
--    ones.
create or replace function public.request_order_permission(p_request_date date)
returns public.order_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  current_member public.members;
  saved_request public.order_requests;
begin
  if public.current_team_id() is null then raise exception 'Team access required'; end if;
  select * into current_member from public.members
    where user_id = auth.uid()
      and team_id = public.current_team_id()
      and status = 'active'
    limit 1;
  if current_member.id is null then
    select * into current_member from public.members
    where team_id = public.current_team_id()
      and status = 'active'
      and lower(trim(coalesce(email, ''))) = lower(trim(coalesce(
            (select email from public.profiles where id = auth.uid()), '')))
      and coalesce((select email from public.profiles where id = auth.uid()), '') <> ''
    limit 1;
  end if;
  if current_member.id is null then raise exception 'Member profile not found'; end if;

  insert into public.order_requests(team_id, member_id, request_date, status)
  values (public.current_team_id(), current_member.id, p_request_date, 'pending')
  on conflict (team_id, member_id, request_date) do update
    set status = case when public.order_requests.status = 'approved'
                      then 'approved' else 'pending' end,
        updated_at = now()
  returning * into saved_request;
  return saved_request;
end;
$$;

revoke all on function public.request_order_permission(date) from public;
grant execute on function public.request_order_permission(date) to authenticated;

-- 4) Temporary diagnostics (removed in the next migration)
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
    'profiles_count', (select count(*) from public.profiles),
    'members_total', (select count(*) from public.members),
    'members_linked', (select count(*) from public.members where user_id is not null),
    'members_unlinked', (
      select coalesce(json_agg(json_build_object('name', name, 'email', email)), '[]'::json)
      from public.members where user_id is null
    ),
    'profiles_without_members_row', (
      select coalesce(json_agg(json_build_object('email', p.email, 'role', p.role)), '[]'::json)
      from public.profiles p
      where not exists (
        select 1 from public.members m
        where lower(trim(coalesce(m.email, ''))) = lower(trim(p.email))
          and m.team_id = p.team_id
      )
    ),
    'policies_order_requests', (
      select coalesce(json_agg(policyname), '[]'::json)
      from pg_policies where schemaname = 'public' and tablename = 'order_requests'
    ),
    'policies_members', (
      select coalesce(json_agg(policyname), '[]'::json)
      from pg_policies where schemaname = 'public' and tablename = 'members'
    ),
    'policies_snacks', (
      select coalesce(json_agg(policyname), '[]'::json)
      from pg_policies where schemaname = 'public' and tablename = 'snacks'
    )
  );
end;
$$;

revoke all on function public.debug_member_access() from public;
grant execute on function public.debug_member_access() to anon, authenticated;
