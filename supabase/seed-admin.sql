do $$
declare
  v_user_id uuid;
begin
  select id into v_user_id from auth.users where email = 'adnan@gmail.com';

  if v_user_id is null then
    v_user_id := gen_random_uuid();

    insert into auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at
    )
    values (
      '00000000-0000-0000-0000-000000000000',
      v_user_id,
      'authenticated',
      'authenticated',
      'adnan@gmail.com',
      crypt('adnan123', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Adnan"}'::jsonb,
      now(),
      now()
    );

    insert into auth.identities (
      provider_id,
      user_id,
      identity_data,
      provider,
      last_sign_in_at,
      created_at,
      updated_at
    )
    values (
      v_user_id::text,
      v_user_id,
      jsonb_build_object('sub', v_user_id::text, 'email', 'adnan@gmail.com', 'email_verified', true),
      'email',
      now(),
      now(),
      now()
    );
  end if;

  insert into public.profiles (id, email, full_name, role)
  values (v_user_id, 'adnan@gmail.com', 'Adnan', 'admin')
  on conflict (id) do update set
    email = excluded.email,
    full_name = excluded.full_name,
    role = excluded.role;
end $$;
