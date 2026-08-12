-- Fix: members could not log in with the initial password.
--
-- Root cause:
--   * create_member_user anchored the login (auth.users.email) to the email
--     typed at add time, but editing a member's email only updated the
--     public.members row. The login email then no longer matched the email
--     shown in the app, so sign-in always failed.
--   * Editing never issued a new password, and there was no way to reset a
--     member's password, so a lost initial password could not be recovered.
--
-- What this script does:
--   1. Rewrites create_member_user so that:
--        - existing members are matched by their member row (not only by the
--          auth email), so re-adding / editing never double-creates an auth user;
--        - the auth user's login email is synced when the member email changes;
--        - p_password is now optional: pass it to set/reset the password, or
--          pass NULL to keep the existing password.
--   2. Heals today's broken members: any member whose auth login email has
--      drifted away from the member email is re-pointed to the member email.
--
-- Run this in the Supabase SQL editor.

create extension if not exists "pgcrypto";

create or replace function public.create_member_user(
  p_full_name text,
  p_email text,
  p_phone text default null,
  p_password text default null
) returns public.members language plpgsql security definer set search_path = public, auth as $$
declare
  v_email text := lower(trim(p_email));
  v_user_id uuid;
  v_auth_email text;
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
  if p_password is not null and nullif(trim(p_password), '') is not null and length(p_password) < 6 then
    raise exception 'Password must be at least 6 characters';
  end if;

  -- 1. find the auth user by its current login email
  select id, email into v_user_id, v_auth_email
  from auth.users
  where lower(email) = v_email
  limit 1;

  -- 2. fall back: the member already exists but its login email drifted
  if v_user_id is null then
    select m.user_id, u.email into v_user_id, v_auth_email
    from public.members m
    left join auth.users u on u.id = m.user_id
    where lower(m.email) = v_email and m.user_id is not null
    limit 1;
  end if;

  if v_user_id is null then
    v_user_id := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    )
    values (
      '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated',
      v_email,
      case when nullif(trim(coalesce(p_password, '')), '') is null then null
           else extensions.crypt(p_password, extensions.gen_salt('bf')) end,
      now(), '', '', '', '',
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object(
        'sub', v_user_id::text,
        'email', v_email,
        'email_verified', true,
        'phone_verified', false,
        'full_name', trim(p_full_name),
        'role', 'user'
      ),
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
    -- sync the login email when the member email changed
    if v_auth_email is not null and lower(v_auth_email) is distinct from v_email then
      if exists (select 1 from auth.users where lower(email) = v_email and id <> v_user_id) then
        raise exception 'Another account already uses %', v_email;
      end if;
      update auth.users
      set email = v_email,
          email_change = coalesce(email_change, ''),
          email_change_token_new = coalesce(email_change_token_new, ''),
          updated_at = now()
      where id = v_user_id;
      update auth.identities
      set identity_data = jsonb_set(coalesce(identity_data, '{}'::jsonb), '{email}', to_jsonb(v_email))
      where user_id = v_user_id and provider = 'email';
    end if;

    -- set/reset the password (NULL keeps the existing password)
    if nullif(trim(coalesce(p_password, '')), '') is not null then
      update auth.users
      set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
          email_confirmed_at = coalesce(email_confirmed_at, now()),
          confirmation_token = coalesce(confirmation_token, ''),
          recovery_token = coalesce(recovery_token, ''),
          updated_at = now()
      where id = v_user_id;
    end if;
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

-- Heal existing members whose auth login email drifted away from the member
-- email (e.g. an edited email never reached auth.users).
do $$
declare
  v_rec record;
begin
  for v_rec in
    select m.id as member_id, m.email as member_email, m.user_id as user_id
    from public.members m
    inner join auth.users u on u.id = m.user_id
    where m.user_id is not null
      and lower(m.email) is distinct from lower(u.email)
  loop
    if exists (select 1 from auth.users where lower(email) = lower(v_rec.member_email) and id <> v_rec.user_id) then
      raise notice 'SKIP member % (%): login email already used by another auth user', v_rec.member_id, v_rec.member_email;
      continue;
    end if;
    update auth.users
    set email = lower(v_rec.member_email),
        updated_at = now()
    where id = v_rec.user_id;
    update auth.identities
    set identity_data = jsonb_set(coalesce(identity_data, '{}'::jsonb), '{email}', to_jsonb(lower(v_rec.member_email)))
    where user_id = v_rec.user_id and provider = 'email';
    update public.profiles
    set email = lower(v_rec.member_email)
    where id = v_rec.user_id;
    update public.members
    set email = lower(email)
    where id = v_rec.member_id;
    raise notice 'Synced login email of member % to %', v_rec.member_id, lower(v_rec.member_email);
  end loop;
end $$;

notify pgrst, 'reload schema';