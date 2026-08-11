create table if not exists public.order_requests (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  request_date date not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(member_id, request_date)
);

create or replace function public.touch_order_request_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists order_requests_touch_updated_at on public.order_requests;
create trigger order_requests_touch_updated_at before update on public.order_requests for each row execute function public.touch_order_request_updated_at();

alter table public.order_requests enable row level security;

drop policy if exists "order requests admin all" on public.order_requests;
drop policy if exists "order requests own read" on public.order_requests;
drop policy if exists "order requests own insert" on public.order_requests;
drop policy if exists "order requests own update" on public.order_requests;

create policy "order requests admin all" on public.order_requests
for all using (public.is_admin()) with check (public.is_admin());

create policy "order requests own read" on public.order_requests
for select using (
  exists(select 1 from public.members m where m.id = order_requests.member_id and m.user_id = auth.uid())
);

create policy "order requests own insert" on public.order_requests
for insert with check (
  exists(select 1 from public.members m where m.id = order_requests.member_id and m.user_id = auth.uid())
);

create policy "order requests own update" on public.order_requests
for update using (
  exists(select 1 from public.members m where m.id = order_requests.member_id and m.user_id = auth.uid())
) with check (
  exists(select 1 from public.members m where m.id = order_requests.member_id and m.user_id = auth.uid())
  and order_requests.status = 'pending'
);

drop policy if exists "orders own insert" on public.orders;
drop policy if exists "orders own update" on public.orders;
drop policy if exists "orders own delete" on public.orders;

create policy "orders own insert" on public.orders
for insert with check (
  exists(select 1 from public.members m where m.id = orders.member_id and m.user_id = auth.uid())
  and (
    localtime < time '16:20'
    or exists(select 1 from public.order_requests r where r.member_id = orders.member_id and r.request_date = orders.order_date and r.status = 'approved')
  )
);

create policy "orders own update" on public.orders
for update using (
  exists(select 1 from public.members m where m.id = orders.member_id and m.user_id = auth.uid())
  and (
    localtime < time '16:20'
    or exists(select 1 from public.order_requests r where r.member_id = orders.member_id and r.request_date = orders.order_date and r.status = 'approved')
  )
) with check (
  exists(select 1 from public.members m where m.id = orders.member_id and m.user_id = auth.uid())
  and (
    localtime < time '16:20'
    or exists(select 1 from public.order_requests r where r.member_id = orders.member_id and r.request_date = orders.order_date and r.status = 'approved')
  )
);

create policy "orders own delete" on public.orders
for delete using (
  exists(select 1 from public.members m where m.id = orders.member_id and m.user_id = auth.uid())
  and localtime < time '16:20'
);

notify pgrst, 'reload schema';
