create extension if not exists "pgcrypto";

do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type app_role as enum ('admin', 'user');
  elsif exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'app_role' and e.enumlabel = 'manager'
  ) and not exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'app_role' and e.enumlabel = 'user'
  ) then
    alter type app_role rename value 'manager' to 'user';
  end if;
end $$;

alter table public.members add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.members add column if not exists email text;
update public.members set email = lower(email) where email is not null;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.members'::regclass and conname = 'members_email_key'
  ) then
    alter table public.members add constraint members_email_key unique (email);
  end if;
end $$;

create or replace function public.app_current_role() returns app_role language sql stable security definer as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_admin() returns boolean language sql stable security definer as $$
  select coalesce(public.app_current_role() = 'admin', false)
$$;

create or replace function public.is_authenticated() returns boolean language sql stable as $$
  select auth.uid() is not null
$$;

create or replace function public.normalize_profile_role() returns trigger language plpgsql as $$
begin
  new.email := lower(new.email);
  if new.email in ('adnan@gmail.com', 'admin@gmail.com') then
    new.role := 'admin';
  elsif new.role is null then
    new.role := 'user';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_role_guard on public.profiles;
create trigger profiles_role_guard before insert or update on public.profiles for each row execute function public.normalize_profile_role();

create or replace function public.create_member_user(
  p_full_name text,
  p_email text,
  p_phone text,
  p_password text
) returns public.members language plpgsql security definer set search_path = public, auth as $$
declare
  v_email text := lower(trim(p_email));
  v_user_id uuid;
  v_member public.members%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Only admin can create member users';
  end if;
  if nullif(trim(p_full_name), '') is null then
    raise exception 'Full name is required';
  end if;
  if v_email is null or v_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' then
    raise exception 'Valid email is required';
  end if;
  if length(coalesce(p_password, '')) < 6 then
    raise exception 'Password must be at least 6 characters';
  end if;

  select id into v_user_id from auth.users where lower(email) = v_email;
  if v_user_id is null then
    v_user_id := gen_random_uuid();

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    )
    values (
      '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated',
      v_email, crypt(p_password, gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', trim(p_full_name), 'role', 'user', 'must_change_password', true),
      now(), now()
    );

    insert into auth.identities (
      provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    )
    values (
      v_user_id::text, v_user_id,
      jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true),
      'email', now(), now(), now()
    );
  else
    update auth.users
    set encrypted_password = crypt(p_password, gen_salt('bf')),
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
          || jsonb_build_object('full_name', trim(p_full_name), 'role', 'user', 'must_change_password', true),
        updated_at = now()
    where id = v_user_id;
  end if;

  insert into public.profiles (id, email, full_name, role)
  values (v_user_id, v_email, trim(p_full_name), 'user')
  on conflict (id) do update set email = excluded.email, full_name = excluded.full_name, role = excluded.role;

  insert into public.members (user_id, name, email, phone, status)
  values (v_user_id, trim(p_full_name), v_email, nullif(trim(coalesce(p_phone, '')), ''), 'active')
  on conflict (email) do update set user_id = excluded.user_id, name = excluded.name, phone = excluded.phone, status = excluded.status
  returning * into v_member;

  return v_member;
end;
$$;

grant execute on function public.create_member_user(text, text, text, text) to authenticated;

do $$
declare
  v_account record;
  v_user_id uuid;
begin
  for v_account in
    select * from (values
      ('adnan@gmail.com', 'adnan123', 'Adnan', 'admin', 'Adnan Khan', '01700000000'),
      ('admin@gmail.com', 'adnan123', 'Admin', 'admin', 'Admin User', '01700000002'),
      ('user@gmail.com', 'adnan123', 'Default User', 'user', 'Default User', '01700000001')
    ) as account(email, password, full_name, app_role, member_name, phone)
  loop
    select id into v_user_id from auth.users where lower(email) = account.email;
    if v_user_id is null then
      v_user_id := gen_random_uuid();
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at
      )
      values (
        '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated',
        account.email, crypt(account.password, gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('full_name', account.full_name, 'role', account.app_role),
        now(), now()
      );
      insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      values (
        v_user_id::text, v_user_id,
        jsonb_build_object('sub', v_user_id::text, 'email', account.email, 'email_verified', true),
        'email', now(), now(), now()
      );
    else
      update auth.users
      set encrypted_password = crypt(account.password, gen_salt('bf')),
          email_confirmed_at = coalesce(email_confirmed_at, now()),
          updated_at = now()
      where id = v_user_id;
    end if;

    insert into public.profiles (id, email, full_name, role)
    values (v_user_id, account.email, account.full_name, account.app_role::app_role)
    on conflict (id) do update set email = excluded.email, full_name = excluded.full_name, role = excluded.role;

    insert into public.members (user_id, name, email, phone, status)
    values (v_user_id, account.member_name, account.email, account.phone, 'active')
    on conflict (email) do update set user_id = excluded.user_id, name = excluded.name, phone = excluded.phone, status = excluded.status;
  end loop;
end $$;

notify pgrst, 'reload schema';
