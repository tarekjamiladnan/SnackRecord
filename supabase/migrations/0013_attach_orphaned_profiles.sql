-- Accounts whose team was deleted (profiles.team_id is set NULL by the
-- foreign key) could never sign in usefully again: current_team_id() returned
-- NULL so every policy and workflow blocked them. Re-attach every orphaned
-- TEAM_ADMIN/MEMBER profile to the project's single team; the
-- sync_member_from_profile trigger then recreates their missing members rows.

update public.profiles p
set team_id = t.id,
    updated_at = now()
from public.teams t
where p.team_id is null
  and p.role in ('TEAM_ADMIN', 'MEMBER')
  and (select count(*) from public.teams) = 1;
