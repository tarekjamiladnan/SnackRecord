create or replace function public.ensure_registration_context()
returns public.teams
language plpgsql
security definer
set search_path = public
as $$
declare
  current_profile public.profiles;
begin
  select * into current_profile from public.profiles where id = auth.uid();
  if current_profile.role = 'SUPER_ADMIN' then return null; end if;
  return public.create_registration_context(
    auth.uid(),
    coalesce(auth.jwt() ->> 'email', ''),
    coalesce((select raw_user_meta_data from auth.users where id = auth.uid()), '{}'::jsonb)
  );
end;
$$;