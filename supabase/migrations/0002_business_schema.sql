create table public.months (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  year integer not null check (year between 2000 and 2200),
  month integer not null check (month between 1 and 12),
  opening_cash numeric(12,2) not null default 0,
  closing_cash numeric(12,2) not null default 0,
  status text not null default 'open' check (status in ('open', 'locked')),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (team_id, year, month)
);

create unique index one_open_month_per_team on public.months(team_id) where status = 'open';

create table public.snacks (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  name text not null,
  price numeric(12,2) not null default 0 check (price >= 0),
  status text not null default 'active' check (status in ('active', 'archived', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, name)
);

create table public.collections (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  member_id uuid not null references public.members(id),
  month_id uuid not null references public.months(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  date date not null,
  remarks text,
  created_at timestamptz not null default now()
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  month_id uuid references public.months(id) on delete cascade,
  date date not null,
  item text not null check (length(trim(item)) > 0),
  amount numeric(12,2) not null check (amount > 0),
  remarks text,
  created_at timestamptz not null default now()
);

create table public.daily_entries (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  month_id uuid not null references public.months(id) on delete cascade,
  entry_date date not null,
  total_cost numeric(12,2) not null default 0 check (total_cost >= 0),
  remarks text,
  created_at timestamptz not null default now(),
  unique (team_id, entry_date)
);

create table public.entry_items (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  entry_id uuid not null references public.daily_entries(id) on delete cascade,
  member_id uuid not null references public.members(id),
  snack_id uuid references public.snacks(id),
  quantity numeric(10,2) not null default 1 check (quantity > 0),
  price numeric(12,2) not null default 0 check (price >= 0),
  amount numeric(12,2) not null default 0 check (amount >= 0)
);

create table public.member_month_balances (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  member_id uuid not null references public.members(id),
  month_id uuid not null references public.months(id) on delete cascade,
  opening_balance numeric(12,2) not null default 0,
  collection numeric(12,2) not null default 0,
  expense_share numeric(12,2) not null default 0,
  closing_balance numeric(12,2) not null default 0,
  unique (team_id, member_id, month_id)
);

create table public.team_settings (
  id integer primary key default 1,
  team_id uuid not null unique references public.teams(id) on delete cascade,
  company_name text not null default 'Phantom Snack Record',
  currency text not null default 'BDT',
  manager_name text,
  min_balance_enabled boolean not null default false,
  min_balance_amount numeric(12,2) not null default 20 check (min_balance_amount >= 0),
  order_closing_time time not null default '16:20',
  updated_at timestamptz not null default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  member_id uuid not null references public.members(id),
  order_date date not null,
  order_text text not null check (length(trim(order_text)) between 1 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, member_id, order_date)
);

create table public.order_requests (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  member_id uuid not null references public.members(id),
  request_date date not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, member_id, request_date)
);

create or replace function public.current_role()
returns public.app_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_team_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.current_role() in ('TEAM_ADMIN', 'SUPER_ADMIN')
$$;

drop function if exists public.close_month(uuid);

create or replace function public.close_month(p_month_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  current_month public.months;
  next_year integer;
  next_month integer;
  next_record public.months;
begin
  if not public.is_team_admin() then raise exception 'Team admin access required'; end if;
  select * into current_month from public.months
    where id = p_month_id and team_id = public.current_team_id() for update;
  if current_month.id is null then raise exception 'Month not found'; end if;
  if current_month.status <> 'open' then raise exception 'Month is already closed'; end if;

  update public.months set status = 'locked', closed_at = now()
    where id = current_month.id;
  next_year := current_month.year + case when current_month.month = 12 then 1 else 0 end;
  next_month := case when current_month.month = 12 then 1 else current_month.month + 1 end;
  insert into public.months(team_id, year, month, opening_cash, closing_cash, status)
  values (current_month.team_id, next_year, next_month, current_month.closing_cash, current_month.closing_cash, 'open')
  on conflict (team_id, year, month) do update set opening_cash = excluded.opening_cash
  returning * into next_record;
  return jsonb_build_object('closed', current_month.id, 'next_month', next_record.id);
end;
$$;

create or replace function public.save_daily_entry(
  p_entry_date date,
  p_remarks text,
  p_items jsonb
)
returns public.daily_entries language plpgsql security definer set search_path = public as $$
declare
  selected_month public.months;
  saved_entry public.daily_entries;
  item jsonb;
  calculated_total numeric(12,2) := 0;
begin
  if public.current_team_id() is null then raise exception 'Team access required'; end if;
  select * into selected_month from public.months where team_id = public.current_team_id()
    and status = 'open' and year = extract(year from p_entry_date)
    and month = extract(month from p_entry_date);
  if selected_month.id is null then raise exception 'Create an open month before saving daily entries'; end if;
  if jsonb_array_length(p_items) = 0 then raise exception 'At least one item is required'; end if;
  for item in select * from jsonb_array_elements(p_items) loop
    if not exists (select 1 from public.members where id = (item->>'member_id')::uuid
      and team_id = public.current_team_id() and status = 'active') then
      raise exception 'One or more members are not active';
    end if;
    calculated_total := calculated_total + greatest(0, (item->>'amount')::numeric);
  end loop;
  insert into public.daily_entries(team_id, month_id, entry_date, total_cost, remarks)
  values (public.current_team_id(), selected_month.id, p_entry_date, calculated_total, nullif(trim(p_remarks), ''))
  on conflict (team_id, entry_date) do update set total_cost = excluded.total_cost, remarks = excluded.remarks,
    month_id = excluded.month_id
  returning * into saved_entry;
  delete from public.entry_items where entry_id = saved_entry.id;
  insert into public.entry_items(team_id, entry_id, member_id, quantity, price, amount)
  select public.current_team_id(), saved_entry.id, (value->>'member_id')::uuid, 1,
    greatest(0, (value->>'amount')::numeric), greatest(0, (value->>'amount')::numeric)
  from jsonb_array_elements(p_items);
  return saved_entry;
end;
$$;

create or replace function public.submit_order(p_order_date date, p_order_text text)
returns public.orders language plpgsql security definer set search_path = public as $$
declare
  current_member public.members;
  settings public.team_settings;
  approved boolean;
  saved_order public.orders;
begin
  select * into current_member from public.members where user_id = auth.uid()
    and team_id = public.current_team_id() and status = 'active';
  if current_member.id is null then raise exception 'Member profile not found'; end if;
  if length(trim(p_order_text)) not between 1 and 500 then raise exception 'Order text is invalid'; end if;
  select * into settings from public.team_settings where team_id = public.current_team_id();
  if settings.team_id is null then
    insert into public.team_settings(team_id) values (public.current_team_id()) returning * into settings;
  end if;
  if settings.min_balance_enabled then
    if (
      coalesce((select opening_balance from public.member_month_balances
        where team_id = public.current_team_id() and member_id = current_member.id
          and month_id = (select id from public.months where team_id = public.current_team_id() and status = 'open' limit 1)), 0)
      + coalesce((select sum(amount) from public.collections where team_id = public.current_team_id()
        and member_id = current_member.id and month_id = (select id from public.months where team_id = public.current_team_id() and status = 'open' limit 1)), 0)
      - coalesce((select sum(ei.amount) from public.entry_items ei join public.daily_entries de on de.id = ei.entry_id
        where ei.team_id = public.current_team_id() and ei.member_id = current_member.id
          and de.month_id = (select id from public.months where team_id = public.current_team_id() and status = 'open' limit 1)), 0)
    ) < settings.min_balance_amount then
      raise exception 'Balance is below the configured minimum';
    end if;
  end if;
  select exists (select 1 from public.order_requests where member_id = current_member.id
    and request_date = p_order_date and status = 'approved') into approved;
  if localtime > settings.order_closing_time and not approved then
    raise exception 'Ordering is closed; request permission from the admin';
  end if;
  insert into public.orders(team_id, member_id, order_date, order_text)
  values (public.current_team_id(), current_member.id, p_order_date, trim(p_order_text))
  on conflict (team_id, member_id, order_date) do update set order_text = excluded.order_text
  returning * into saved_order;
  return saved_order;
end;
$$;

alter table public.months enable row level security;
alter table public.snacks enable row level security;
alter table public.collections enable row level security;
alter table public.expenses enable row level security;
alter table public.daily_entries enable row level security;
alter table public.entry_items enable row level security;
alter table public.member_month_balances enable row level security;
alter table public.team_settings enable row level security;
alter table public.orders enable row level security;
alter table public.order_requests enable row level security;

create policy months_team_read on public.months for select using (team_id = public.current_team_id());
create policy months_admin_write on public.months for all using (team_id = public.current_team_id() and public.is_team_admin()) with check (team_id = public.current_team_id() and public.is_team_admin());
create policy snacks_team_read on public.snacks for select using (team_id = public.current_team_id());
create policy snacks_admin_write on public.snacks for all using (team_id = public.current_team_id() and public.is_team_admin()) with check (team_id = public.current_team_id() and public.is_team_admin());
create policy collections_team_read on public.collections for select using (team_id = public.current_team_id());
create policy collections_admin_write on public.collections for all using (team_id = public.current_team_id() and public.is_team_admin()) with check (team_id = public.current_team_id() and public.is_team_admin() and exists (select 1 from public.members m where m.id = member_id and m.team_id = public.current_team_id()) and exists (select 1 from public.months mo where mo.id = month_id and mo.team_id = public.current_team_id()));
create policy expenses_team_read on public.expenses for select using (team_id = public.current_team_id());
create policy expenses_admin_write on public.expenses for all using (team_id = public.current_team_id() and public.is_team_admin()) with check (team_id = public.current_team_id() and public.is_team_admin() and (month_id is null or exists (select 1 from public.months mo where mo.id = month_id and mo.team_id = public.current_team_id())));
create policy entries_team_read on public.daily_entries for select using (team_id = public.current_team_id());
create policy entry_items_team_read on public.entry_items for select using (team_id = public.current_team_id());
create policy balances_team_read on public.member_month_balances for select using (team_id = public.current_team_id());
create policy settings_team_read on public.team_settings for select using (team_id = public.current_team_id());
create policy settings_admin_write on public.team_settings for all using (team_id = public.current_team_id() and public.is_team_admin()) with check (team_id = public.current_team_id() and public.is_team_admin());
create policy orders_team_read on public.orders for select using (team_id = public.current_team_id());
create policy orders_admin_write on public.orders for all using (team_id = public.current_team_id() and public.is_team_admin()) with check (team_id = public.current_team_id() and public.is_team_admin() and exists (select 1 from public.members m where m.id = member_id and m.team_id = public.current_team_id()));
create policy order_requests_team_read on public.order_requests for select using (team_id = public.current_team_id());
create policy order_requests_admin_write on public.order_requests for all using (team_id = public.current_team_id() and public.is_team_admin()) with check (team_id = public.current_team_id() and public.is_team_admin());
create policy order_requests_member_insert on public.order_requests for insert
  with check (team_id = public.current_team_id() and member_id in (
    select id from public.members where user_id = auth.uid() and team_id = public.current_team_id()
  ));
create policy order_requests_member_update on public.order_requests for update
  using (team_id = public.current_team_id() and member_id in (
    select id from public.members where user_id = auth.uid() and team_id = public.current_team_id()
  ))
  with check (team_id = public.current_team_id() and status = 'pending' and member_id in (
    select id from public.members where user_id = auth.uid() and team_id = public.current_team_id()
  ));

revoke all on function public.close_month(uuid) from public;
revoke all on function public.save_daily_entry(date, text, jsonb) from public;
revoke all on function public.submit_order(date, text) from public;
grant execute on function public.close_month(uuid), public.save_daily_entry(date, text, jsonb), public.submit_order(date, text) to authenticated;