drop policy if exists "orders own insert" on public.orders;
drop policy if exists "orders own update" on public.orders;
drop policy if exists "orders own delete" on public.orders;

create policy "orders own insert" on public.orders
for insert with check (
  exists(select 1 from public.members m where m.id = orders.member_id and m.user_id = auth.uid())
);

create policy "orders own update" on public.orders
for update using (
  exists(select 1 from public.members m where m.id = orders.member_id and m.user_id = auth.uid())
) with check (
  exists(select 1 from public.members m where m.id = orders.member_id and m.user_id = auth.uid())
);

create policy "orders own delete" on public.orders
for delete using (
  exists(select 1 from public.members m where m.id = orders.member_id and m.user_id = auth.uid())
);

notify pgrst, 'reload schema';
