create extension if not exists "pgcrypto";

do $$
declare
  v_user_id uuid;
  v_auth_email text := 'phantom.user@gmail.com';
  v_public_email text := 'user@gmail.com';
begin
  delete from auth.identities
  where user_id in (select id from auth.users where lower(email) = v_public_email);
  delete from auth.users where lower(email) = v_public_email;

  select id into v_user_id from auth.users where lower(email) = v_auth_email;
  if v_user_id is null then
    v_user_id := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    )
    values (
      '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated',
      v_auth_email, extensions.crypt('adnan123', extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object(
        'sub', v_user_id::text,
        'email', v_auth_email,
        'email_verified', true,
        'phone_verified', false,
        'full_name', 'Default User',
        'role', 'user',
        'login_email', v_public_email
      ),
      now(), now()
    );
  else
    update auth.users
    set encrypted_password = extensions.crypt('adnan123', extensions.gen_salt('bf')),
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
          || jsonb_build_object(
            'sub', v_user_id::text,
            'email', v_auth_email,
            'email_verified', true,
            'phone_verified', false,
            'full_name', 'Default User',
            'role', 'user',
            'login_email', v_public_email
          ),
        updated_at = now()
    where id = v_user_id;
  end if;

  insert into auth.identities (
    provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  )
  values (
    v_user_id::text,
    v_user_id,
    jsonb_build_object('sub', v_user_id::text, 'email', v_auth_email, 'email_verified', true),
    'email',
    now(),
    now(),
    now()
  )
  on conflict (provider, provider_id) do update set
    user_id = excluded.user_id,
    identity_data = excluded.identity_data,
    updated_at = now();

  insert into public.profiles (id, email, full_name, role)
  values (v_user_id, v_public_email, 'Default User', 'user')
  on conflict (id) do update set
    email = excluded.email,
    full_name = excluded.full_name,
    role = excluded.role;

  insert into public.members (user_id, name, email, phone, status)
  values (v_user_id, 'Default User', v_public_email, '01700000001', 'active')
  on conflict (email) do update set
    user_id = excluded.user_id,
    name = excluded.name,
    phone = excluded.phone,
    status = excluded.status;
end $$;
