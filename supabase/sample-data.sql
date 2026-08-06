insert into members(name, phone) values
  ('Uttam Bhai', ''),
  ('Kaium Bhai', ''),
  ('Azizul Bhai', ''),
  ('Anower Bhai', ''),
  ('Rafiq Bhai', ''),
  ('Zakaria Bhai', ''),
  ('Tarek', '')
on conflict do nothing;

insert into menus(name, price) values
  ('Tea', 0),
  ('Coffee', 0),
  ('Singara', 0),
  ('Samosa', 0),
  ('Cake', 0)
on conflict (name) do update set price = excluded.price;

insert into months(year, month, opening_cash, closing_cash, status)
values (2026, 8, 0, 0, 'open')
on conflict (year, month) do nothing;
