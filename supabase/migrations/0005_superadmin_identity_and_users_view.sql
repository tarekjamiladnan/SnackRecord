insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
select u.id::text, u.id, jsonb_build_object('sub', u.id::text, 'email', u.email), 'email', now(), now()
from auth.users u
where lower(u.email) = 'superadmin@gmail.com'
  and not exists (
    select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email'
  );

create or replace view public.users
with (security_invoker = true)
as
select id, team_id, name, email, phone, role, created_at, updated_at
from public.profiles;

grant select on public.users to authenticated;
