-- Seeds the SUPER_ADMIN auth user, identity, and profile.
-- Idempotent: creates the user if missing, otherwise refreshes its password.
-- Run via: npx supabase db push  (or psql against the target database)

do $$
declare
  v_id uuid;
  v_email text := lower(trim('bsse1520@iit.du.ac.bd'));
begin
  select u.id into v_id
  from auth.users u
  where lower(u.email) = v_email
  limit 1;

  if v_id is null then
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      confirmation_token, recovery_token, email_change, email_change_token_new
    ) values (
      '00000000-0000-0000-0000-000000000000',
      gen_random_uuid(),
      'authenticated',
      'authenticated',
      v_email,
      crypt('SuperAdmin@123', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb,
      now(), now(),
      '', '', '', ''
    )
    returning id into v_id;

    insert into auth.identities (
      provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    ) values (
      v_id::text,
      v_id,
      jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
      'email',
      now(), now(), now()
    );
  else
    update auth.users
    set encrypted_password = crypt('SuperAdmin@123', gen_salt('bf')),
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        updated_at = now()
    where id = v_id;

    insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    select v_id::text, v_id,
      jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
      'email', now(), now(), now()
    where not exists (
      select 1 from auth.identities i where i.user_id = v_id and i.provider = 'email'
    );
  end if;

  insert into public.profiles (id, team_id, name, email, role)
  values (v_id, null, 'Super Admin', v_email, 'SUPER_ADMIN')
  on conflict (id) do update
    set role = 'SUPER_ADMIN',
        team_id = null,
        email = excluded.email,
        updated_at = now();
end;
$$;
