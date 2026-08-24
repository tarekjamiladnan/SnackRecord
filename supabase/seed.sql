-- Safe baseline seed. Authentication users must be created through Supabase Auth,
-- never by inserting password data into this file.
do $$
begin
  insert into public.teams (id, name, slug, status)
  values ('00000000-0000-0000-0000-000000000001', 'Demo Snack Team', 'demo-snack-team', 'ACTIVE')
  on conflict (id) do update set name = excluded.name, status = excluded.status;

  insert into public.team_settings (team_id, company_name, currency, order_closing_time)
  values ('00000000-0000-0000-0000-000000000001', 'Demo Snack Team', 'BDT', '16:20')
  on conflict (team_id) do update set company_name = excluded.company_name,
    currency = excluded.currency, order_closing_time = excluded.order_closing_time;

  insert into public.months (team_id, year, month, opening_cash, closing_cash, status)
  values ('00000000-0000-0000-0000-000000000001', extract(year from current_date)::integer,
    extract(month from current_date)::integer, 0, 0, 'open')
  on conflict (team_id, year, month) do nothing;
end;
$$;
