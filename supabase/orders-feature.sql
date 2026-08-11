alter table public.settings add column if not exists min_balance_enabled boolean not null default false;
alter table public.settings add column if not exists min_balance_amount numeric(12,2) not null default 20;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  order_date date not null,
  order_text text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(member_id, order_date)
);

create or replace function public.touch_order_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists orders_touch_updated_at on public.orders;
create trigger orders_touch_updated_at before update on public.orders for each row execute function public.touch_order_updated_at();

alter table public.orders enable row level security;

drop policy if exists "orders admin all" on public.orders;
drop policy if exists "orders own read" on public.orders;
drop policy if exists "orders own insert" on public.orders;
drop policy if exists "orders own update" on public.orders;
drop policy if exists "orders own delete" on public.orders;

create policy "orders admin all" on public.orders
for all using (public.is_admin()) with check (public.is_admin());

create policy "orders own read" on public.orders
for select using (
  exists(select 1 from public.members m where m.id = orders.member_id and m.user_id = auth.uid())
);

create policy "orders own insert" on public.orders
for insert with check (
  localtime < time '16:20'
  and exists(select 1 from public.members m where m.id = orders.member_id and m.user_id = auth.uid())
);

create policy "orders own update" on public.orders
for update using (
  localtime < time '16:20'
  and exists(select 1 from public.members m where m.id = orders.member_id and m.user_id = auth.uid())
) with check (
  localtime < time '16:20'
  and exists(select 1 from public.members m where m.id = orders.member_id and m.user_id = auth.uid())
);

create policy "orders own delete" on public.orders
for delete using (
  localtime < time '16:20'
  and exists(select 1 from public.members m where m.id = orders.member_id and m.user_id = auth.uid())
);

notify pgrst, 'reload schema';
