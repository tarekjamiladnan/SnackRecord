-- Members (role MEMBER) must be able to use every team workflow: adding menu
-- items, managing members, placing orders, requesting late-order permission
-- and saving daily entries. The order/daily-entry RPCs are already
-- role-agnostic; these changes unblock the remaining RLS paths.

-- 1) Menu: every user of the team can add/update snack items
drop policy if exists snacks_admin_write on public.snacks;
create policy snacks_team_write on public.snacks for all
  using (team_id = public.current_team_id())
  with check (team_id = public.current_team_id());

-- 2) Members list: every user of the team can edit/archive member rows
--    (account creation still flows through the manage-member edge function)
drop policy if exists members_admin_update on public.members;
create policy members_team_update on public.members for update
  using (team_id = public.current_team_id())
  with check (team_id = public.current_team_id());

-- 3) Backfill members.user_id from profiles so submit_order() can find the
--    caller ("Member profile not found") and late-order permission requests
--    resolve to the signed-in member.
update public.members m
set user_id = p.id
from public.profiles p
where m.user_id is null
  and m.team_id = p.team_id
  and lower(m.email) = lower(p.email);
