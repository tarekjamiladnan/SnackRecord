alter table public.members add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.members add column if not exists email text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.members'::regclass and conname = 'members_email_key'
  ) then
    alter table public.members add constraint members_email_key unique (email);
  end if;
end $$;

insert into public.profiles(id, email, full_name, role)
select
  u.id,
  lower(u.email),
  coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)),
  case when lower(u.email) in ('adnan@gmail.com', 'admin@gmail.com') then 'admin'::app_role else 'user'::app_role end
from auth.users u
where u.email is not null
on conflict (id) do update set
  email = excluded.email,
  full_name = coalesce(public.profiles.full_name, excluded.full_name),
  role = case when excluded.email in ('adnan@gmail.com', 'admin@gmail.com') then 'admin'::app_role else public.profiles.role end;

insert into public.members(user_id, name, email, phone, status)
select
  u.id,
  coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)),
  lower(u.email),
  null,
  'active'
from auth.users u
where u.email is not null
  and lower(u.email) not in ('adnan@gmail.com', 'admin@gmail.com')
on conflict (email) do update set
  user_id = excluded.user_id,
  name = coalesce(public.members.name, excluded.name),
  status = 'active';

notify pgrst, 'reload schema';
