delete from auth.identities
where user_id in (select id from auth.users where lower(email) = 'user@gmail.com');

delete from public.profiles
where lower(email) = 'user@gmail.com';

update public.members
set user_id = null
where lower(email) = 'user@gmail.com';

delete from auth.users
where lower(email) = 'user@gmail.com';
