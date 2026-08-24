-- Profiles belonging to a team must always have a matching members row:
-- ordering, late-order permissions and daily entries all resolve the caller
-- through public.members. Accounts created outside the manage-member edge
-- function (dashboard invites, manual SQL, older flows) ended up with a
-- profile but no members row, breaking every member workflow for them.

-- 1) Backfill: create the missing members rows for team profiles
insert into public.members(team_id, user_id, name, email, phone, status)
select p.team_id, p.id, p.name, p.email, p.phone, 'active'
from public.profiles p
where p.team_id is not null
  and p.role <> 'SUPER_ADMIN'
  and not exists (select 1 from public.members m where m.user_id = p.id)
  and not exists (
    select 1 from public.members m
    where m.team_id = p.team_id
      and lower(trim(coalesce(m.email, ''))) = lower(trim(p.email))
  );

-- 2) Link any legacy unlinked member rows that match a profile by team + email
update public.members m
set user_id = p.id
from public.profiles p
where m.user_id is null
  and m.team_id = p.team_id
  and lower(trim(coalesce(m.email, ''))) = lower(trim(p.email));

-- 3) Keep them in sync going forward: whenever a profile joins a team (or is
--    created), make sure a members row exists. Existing flows that insert the
--    members row first are unaffected (the insert below becomes a no-op).
create or replace function public.sync_member_from_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.team_id is not null and new.role <> 'SUPER_ADMIN' then
    update public.members m
    set user_id = new.id
    where m.team_id = new.team_id
      and m.user_id is null
      and lower(trim(coalesce(m.email, ''))) = lower(trim(coalesce(new.email, '')))
      and coalesce(new.email, '') <> '';

    insert into public.members(team_id, user_id, name, email, phone, status)
    select new.team_id, new.id, new.name, new.email, new.phone, 'active'
    where not exists (select 1 from public.members m where m.user_id = new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists on_profile_sync_members on public.profiles;
create trigger on_profile_sync_members
after insert or update of team_id, role, email on public.profiles
for each row execute function public.sync_member_from_profile();
