insert into public.menus(name, price, status)
values
  ('Tea', 10, 'active'),
  ('Coffee', 20, 'active'),
  ('Singara', 12, 'active'),
  ('Cake', 30, 'active')
on conflict (name) do update set
  price = excluded.price,
  status = excluded.status;

insert into public.settings(id, company_name, currency, manager_name)
values (1, 'Phantom Snack Record', 'BDT', 'Adnan')
on conflict (id) do update set
  company_name = excluded.company_name,
  currency = excluded.currency,
  manager_name = excluded.manager_name;
