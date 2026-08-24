create sequence if not exists public.team_settings_id_seq;

select setval(
  'public.team_settings_id_seq',
  greatest(coalesce((select max(id) from public.team_settings), 0), 1),
  true
);

alter table public.team_settings
  alter column id set default nextval('public.team_settings_id_seq');

alter sequence public.team_settings_id_seq owned by public.team_settings.id;
