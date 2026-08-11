create extension if not exists "pgcrypto";

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
    select id into v_user_id from auth.users where lower(email) = v_account.email;

    if v_user_id is null then
      v_user_id := gen_random_uuid();
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at
      )
      values (
        '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated',
        v_account.email, extensions.crypt(v_account.password, extensions.gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object(
          'sub', v_user_id::text,
          'email', v_account.email,
          'email_verified', true,
          'phone_verified', false,
          'full_name', v_account.full_name,
          'role', v_account.app_role
        ),
        now(), now()
      );
    else
      update auth.users
      set encrypted_password = extensions.crypt(v_account.password, extensions.gen_salt('bf')),
          email_confirmed_at = coalesce(email_confirmed_at, now()),
          raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
            || jsonb_build_object(
              'sub', v_user_id::text,
              'email', v_account.email,
              'email_verified', true,
              'phone_verified', false,
              'full_name', v_account.full_name,
              'role', v_account.app_role
            ),
          updated_at = now()
      where id = v_user_id;
    end if;

    insert into auth.identities (
      provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    )
    values (
      v_user_id::text, v_user_id,
      jsonb_build_object('sub', v_user_id::text, 'email', v_account.email, 'email_verified', true),
      'email', now(), now(), now()
    )
    on conflict (provider, provider_id) do update set
      user_id = excluded.user_id,
      identity_data = excluded.identity_data,
      updated_at = now();

    insert into public.profiles (id, email, full_name, role)
    values (v_user_id, v_account.email, v_account.full_name, v_account.app_role::app_role)
    on conflict (id) do update set
      email = excluded.email,
      full_name = excluded.full_name,
      role = excluded.role;

    insert into public.members (user_id, name, email, phone, status)
    values (v_user_id, v_account.member_name, v_account.email, v_account.phone, 'active')
    on conflict (email) do update set
      user_id = excluded.user_id,
      name = excluded.name,
      phone = excluded.phone,
      status = excluded.status;
  end loop;
end $$;

notify pgrst, 'reload schema';
