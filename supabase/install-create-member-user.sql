create extension if not exists "pgcrypto";

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
      confirmation_token, recovery_token, email_change_token_new, email_change,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    )
    values (
      '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated',
      v_email, extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
      '', '', '', '',
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object(
        'sub', v_user_id::text,
        'email', v_email,
        'email_verified', true,
        'phone_verified', false,
        'full_name', trim(p_full_name),
        'role', 'user',
        'must_change_password', true
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
    update auth.users
    set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        confirmation_token = coalesce(confirmation_token, ''),
        recovery_token = coalesce(recovery_token, ''),
        email_change_token_new = coalesce(email_change_token_new, ''),
        email_change = coalesce(email_change, ''),
        raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
          || jsonb_build_object(
            'sub', v_user_id::text,
            'email', v_email,
            'email_verified', true,
            'phone_verified', false,
            'full_name', trim(p_full_name),
            'role', 'user',
            'must_change_password', true
          ),
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
notify pgrst, 'reload schema';
