-- Normal members are read-only for the team member list. Account creation
-- and edits already flow through the manage-member edge function (admin-only).
-- This restores admin-only UPDATE/archive on public.members, which was
-- widened to all team users in 0009.

drop policy if exists members_team_update on public.members;
drop policy if exists members_admin_update on public.members;

create policy members_admin_update on public.members for update
  using (team_id = public.current_team_id() and exists (
    select 1 from public.profiles where id = auth.uid() and role = 'TEAM_ADMIN'
  ))
  with check (team_id = public.current_team_id());