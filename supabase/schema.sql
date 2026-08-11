create extension if not exists "pgcrypto";

create type app_role as enum ('admin', 'user');
create type record_status as enum ('active', 'archived', 'inactive');
create type month_status as enum ('open', 'locked');

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text,
  role app_role not null default 'user',
  created_at timestamptz not null default now()
);

create table members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  name text not null,
  email text unique,
  phone text,
  status record_status not null default 'active',
  created_at timestamptz not null default now()
);

create table menus (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  price numeric(12,2) not null check (price >= 0),
  status record_status not null default 'active',
  created_at timestamptz not null default now()
);

create table months (
  id uuid primary key default gen_random_uuid(),
  year int not null check (year between 2000 and 2100),
  month int not null check (month between 1 and 12),
  opening_cash numeric(12,2) not null default 0,
  closing_cash numeric(12,2) not null default 0,
  status month_status not null default 'open',
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(year, month)
);

-- Enforce that only one month can be open at a time (the current month).
update months m
set status = 'locked', closed_at = coalesce(m.closed_at, now())
where m.status = 'open'
  and m.id <> (select id from months where status = 'open' order by year desc, month desc limit 1);

create unique index if not exists one_open_month on months ((1)) where status = 'open';

create table daily_entries (
  id uuid primary key default gen_random_uuid(),
  month_id uuid not null references months(id) on delete cascade,
  entry_date date not null,
  total_cost numeric(12,2) not null default 0,
  remarks text,
  created_at timestamptz not null default now()
);

create table entry_items (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references daily_entries(id) on delete cascade,
  member_id uuid not null references members(id),
  menu_id uuid references menus(id),
  quantity numeric(10,2) not null default 1,
  price numeric(12,2) not null default 0,
  amount numeric(12,2) not null default 0
);

create table expenses (
  id uuid primary key default gen_random_uuid(),
  month_id uuid references months(id) on delete cascade,
  date date not null,
  item text not null,
  amount numeric(12,2) not null check (amount >= 0),
  remarks text,
  created_at timestamptz not null default now()
);

create table collections (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id),
  month_id uuid references months(id) on delete cascade,
  amount numeric(12,2) not null check (amount >= 0),
  date date not null,
  remarks text,
  created_at timestamptz not null default now()
);

create table member_month_balances (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  month_id uuid not null references months(id) on delete cascade,
  opening_balance numeric(12,2) not null default 0,
  collection numeric(12,2) not null default 0,
  expense_share numeric(12,2) not null default 0,
  closing_balance numeric(12,2) not null default 0,
  unique(member_id, month_id)
);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id),
  action text not null,
  entity text,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table settings (
  id int primary key default 1 check (id = 1),
  company_name text not null default 'Phantom Snack Record',
  logo_url text,
  currency text not null default 'BDT',
  manager_name text,
  updated_at timestamptz not null default now()
);

create view member_month_report as
select b.*, m.name as member_name, mo.year, mo.month
from member_month_balances b
join members m on m.id = b.member_id
join months mo on mo.id = b.month_id;

create or replace function app_current_role() returns app_role language sql stable security definer as $$
  select role from profiles where id = auth.uid()
$$;

create or replace function is_admin() returns boolean language sql stable security definer as $$
  select coalesce(app_current_role() = 'admin', false)
$$;

create or replace function normalize_profile_role() returns trigger language plpgsql as $$
begin
  new.email := lower(new.email);
  if new.email in ('adnan@gmail.com', 'admin@gmail.com') then
    new.role := 'admin';
  elsif new.role is null then
    new.role := 'user';
  end if;
  return new;
end;
$$;

create trigger profiles_role_guard before insert or update on profiles for each row execute function normalize_profile_role();

create or replace function is_authenticated() returns boolean language sql stable as $$
  select auth.uid() is not null
$$;

create or replace function create_member_user(
  p_full_name text,
  p_email text,
  p_phone text,
  p_password text
) returns members language plpgsql security definer set search_path = public, auth as $$
declare
  v_email text := lower(trim(p_email));
  v_user_id uuid;
  v_member members%rowtype;
begin
  if not is_admin() then
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
      v_email,
      crypt(p_password, gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', trim(p_full_name), 'role', 'user', 'must_change_password', true),
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
      jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true),
      'email',
      now(),
      now(),
      now()
    );
  else
    update auth.users
    set encrypted_password = crypt(p_password, gen_salt('bf')),
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
          || jsonb_build_object('full_name', trim(p_full_name), 'role', 'user', 'must_change_password', true),
        updated_at = now()
    where id = v_user_id;
  end if;

  insert into profiles (id, email, full_name, role)
  values (v_user_id, v_email, trim(p_full_name), 'user')
  on conflict (id) do update set
    email = excluded.email,
    full_name = excluded.full_name,
    role = excluded.role;

  insert into members (user_id, name, email, phone, status)
  values (v_user_id, trim(p_full_name), v_email, nullif(trim(coalesce(p_phone, '')), ''), 'active')
  on conflict (email) do update set
    user_id = excluded.user_id,
    name = excluded.name,
    phone = excluded.phone,
    status = excluded.status
  returning * into v_member;

  return v_member;
end;
$$;

grant execute on function create_member_user(text, text, text, text) to authenticated;

create or replace function month_is_open(p_month_id uuid) returns boolean language sql stable as $$
  select exists(select 1 from months where id = p_month_id and status = 'open')
$$;

create or replace function prevent_locked_month_edits() returns trigger language plpgsql as $$
declare v_month_id uuid;
begin
  v_month_id := coalesce(new.month_id, old.month_id);
  if v_month_id is not null
     and exists(select 1 from months where id = v_month_id)
     and not month_is_open(v_month_id) then
    raise exception 'Month is locked';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger expenses_locked_guard before insert or update or delete on expenses for each row execute function prevent_locked_month_edits();
create trigger collections_locked_guard before insert or update or delete on collections for each row execute function prevent_locked_month_edits();
create trigger daily_entries_locked_guard before insert or update or delete on daily_entries for each row execute function prevent_locked_month_edits();

create or replace function close_month(p_month_id uuid) returns void language plpgsql security definer as $$
declare
  v_month months%rowtype;
  v_next_year int;
  v_next_month int;
  v_next_id uuid;
  v_total_collection numeric(12,2);
  v_total_used numeric(12,2);
begin
  if not is_admin() then raise exception 'Only admin can close month'; end if;
  select * into v_month from months where id = p_month_id for update;
  if not found then raise exception 'Month not found'; end if;
  if v_month.status = 'locked' then raise exception 'Month already locked'; end if;

  select coalesce(sum(amount),0) into v_total_collection from collections where month_id = p_month_id;
  select coalesce(sum(ei.amount),0) into v_total_used
  from entry_items ei
  join daily_entries de on de.id = ei.entry_id
  where de.month_id = p_month_id;

  insert into member_month_balances(member_id, month_id, opening_balance, collection, expense_share, closing_balance)
  select m.id, p_month_id,
    coalesce(prev.closing_balance, 0),
    coalesce(c.collection, 0),
    coalesce(i.used_amount, 0),
    coalesce(prev.closing_balance, 0) + coalesce(c.collection, 0) - coalesce(i.used_amount, 0)
  from members m
  left join lateral (
    select b.closing_balance from member_month_balances b join months mo on mo.id = b.month_id
    where b.member_id = m.id and (mo.year, mo.month) < (v_month.year, v_month.month)
    order by mo.year desc, mo.month desc limit 1
  ) prev on true
  left join (select member_id, sum(amount) collection from collections where month_id = p_month_id group by member_id) c on c.member_id = m.id
  left join (select ei.member_id, sum(ei.amount) used_amount from entry_items ei join daily_entries de on de.id = ei.entry_id where de.month_id = p_month_id group by ei.member_id) i on i.member_id = m.id
  where m.status <> 'inactive'
  on conflict(member_id, month_id) do update set collection = excluded.collection, expense_share = excluded.expense_share, closing_balance = excluded.closing_balance;

  update months set closing_cash = opening_cash + v_total_collection - v_total_used, status = 'locked', closed_at = now() where id = p_month_id;
  v_next_year := case when v_month.month = 12 then v_month.year + 1 else v_month.year end;
  v_next_month := case when v_month.month = 12 then 1 else v_month.month + 1 end;
  insert into months(year, month, opening_cash, closing_cash, status)
  values (v_next_year, v_next_month, v_month.opening_cash + v_total_collection - v_total_used, v_month.opening_cash + v_total_collection - v_total_used, 'open')
  on conflict(year, month) do update set opening_cash = excluded.opening_cash, closing_cash = excluded.closing_cash, status = 'open', closed_at = null
  returning id into v_next_id;
  insert into member_month_balances(member_id, month_id, opening_balance, closing_balance)
  select member_id, v_next_id, closing_balance, closing_balance from member_month_balances where month_id = p_month_id
  on conflict(member_id, month_id) do update set opening_balance = excluded.opening_balance, closing_balance = excluded.closing_balance;
end;
$$;

create or replace function delete_month(p_month_id uuid) returns void language plpgsql security definer as $$
begin
  if not is_admin() then raise exception 'Only admin can delete month'; end if;
  alter table daily_entries disable trigger daily_entries_locked_guard;
  alter table expenses disable trigger expenses_locked_guard;
  alter table collections disable trigger collections_locked_guard;
  begin
    delete from daily_entries where month_id = p_month_id;
    delete from expenses where month_id = p_month_id;
    delete from collections where month_id = p_month_id;
    delete from member_month_balances where month_id = p_month_id;
    delete from months where id = p_month_id;
    alter table daily_entries enable trigger daily_entries_locked_guard;
    alter table expenses enable trigger expenses_locked_guard;
    alter table collections enable trigger collections_locked_guard;
  exception when others then
    alter table daily_entries enable trigger daily_entries_locked_guard;
    alter table expenses enable trigger expenses_locked_guard;
    alter table collections enable trigger collections_locked_guard;
    raise;
  end;
end;
$$;

alter table profiles enable row level security;
alter table members enable row level security;
alter table menus enable row level security;
alter table months enable row level security;
alter table daily_entries enable row level security;
alter table entry_items enable row level security;
alter table expenses enable row level security;
alter table collections enable row level security;
alter table member_month_balances enable row level security;
alter table audit_logs enable row level security;
alter table settings enable row level security;

create policy "profiles self read" on profiles for select using (auth.uid() = id or is_admin());
create policy "profiles admin write" on profiles for all using (is_admin()) with check (is_admin());

create policy "authenticated read members" on members for select using (is_authenticated());
create policy "admin write members" on members for insert with check (is_admin());
create policy "admin update members" on members for update using (is_admin()) with check (is_admin());
create policy "admin delete members" on members for delete using (is_admin());

create policy "authenticated read menus" on menus for select using (is_authenticated());
create policy "admin write menus" on menus for all using (is_admin()) with check (is_admin());

create policy "authenticated read months" on months for select using (is_authenticated());
create policy "admin write months" on months for all using (is_admin()) with check (is_admin());

create policy "authenticated read daily entries" on daily_entries for select using (is_authenticated());
create policy "admin write daily entries" on daily_entries for all using (is_admin()) with check (is_admin());
create policy "authenticated read entry items" on entry_items for select using (is_authenticated());
create policy "admin write entry items" on entry_items for all using (is_admin()) with check (is_admin());
create policy "authenticated read expenses" on expenses for select using (is_authenticated());
create policy "admin write expenses" on expenses for all using (is_admin()) with check (is_admin());
create policy "own or admin read collections" on collections for select using (is_admin() or exists(select 1 from members m where m.id = collections.member_id and m.user_id = auth.uid()));
create policy "admin write collections" on collections for all using (is_admin()) with check (is_admin());
create policy "own or admin read balances" on member_month_balances for select using (is_admin() or exists(select 1 from members m where m.id = member_month_balances.member_id and m.user_id = auth.uid()));
create policy "admin write balances" on member_month_balances for all using (is_admin()) with check (is_admin());
create policy "authenticated audit insert" on audit_logs for insert with check (auth.uid() = actor_id);
create policy "admin audit read" on audit_logs for select using (is_admin());
create policy "authenticated read settings" on settings for select using (is_authenticated());
create policy "admin write settings" on settings for all using (is_admin()) with check (is_admin());

insert into settings(id, company_name, currency, manager_name) values (1, 'Phantom Snack Record', 'BDT', 'Adnan') on conflict do nothing;
