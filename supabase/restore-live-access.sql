create or replace function public.app_current_role() returns app_role language sql stable security definer as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_admin() returns boolean language sql stable security definer as $$
  select coalesce(public.app_current_role() = 'admin', false)
$$;

create or replace function public.is_authenticated() returns boolean language sql stable as $$
  select auth.uid() is not null
$$;

create or replace function public.is_manager_or_admin() returns boolean language sql stable security definer as $$
  select public.is_authenticated()
$$;

drop policy if exists "authenticated read members" on public.members;
drop policy if exists "admin manager write members" on public.members;
drop policy if exists "admin manager update members" on public.members;
drop policy if exists "admin write members" on public.members;
drop policy if exists "admin update members" on public.members;
drop policy if exists "admin delete members" on public.members;
create policy "authenticated read members" on public.members for select using (public.is_authenticated());
create policy "admin write members" on public.members for insert with check (public.is_admin());
create policy "admin update members" on public.members for update using (public.is_admin()) with check (public.is_admin());
create policy "admin delete members" on public.members for delete using (public.is_admin());

drop policy if exists "authenticated read menus" on public.menus;
drop policy if exists "authenticated write menus" on public.menus;
drop policy if exists "admin write menus" on public.menus;
create policy "authenticated read menus" on public.menus for select using (public.is_authenticated());
create policy "admin write menus" on public.menus for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "authenticated read months" on public.months;
drop policy if exists "admin write months" on public.months;
create policy "authenticated read months" on public.months for select using (public.is_authenticated());
create policy "admin write months" on public.months for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "authenticated read daily entries" on public.daily_entries;
drop policy if exists "authenticated write daily entries" on public.daily_entries;
drop policy if exists "admin write daily entries" on public.daily_entries;
create policy "authenticated read daily entries" on public.daily_entries for select using (public.is_authenticated());
create policy "admin write daily entries" on public.daily_entries for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "authenticated read entry items" on public.entry_items;
drop policy if exists "authenticated write entry items" on public.entry_items;
drop policy if exists "admin write entry items" on public.entry_items;
create policy "authenticated read entry items" on public.entry_items for select using (public.is_authenticated());
create policy "admin write entry items" on public.entry_items for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "authenticated read expenses" on public.expenses;
drop policy if exists "authenticated write expenses" on public.expenses;
drop policy if exists "admin write expenses" on public.expenses;
create policy "authenticated read expenses" on public.expenses for select using (public.is_authenticated());
create policy "admin write expenses" on public.expenses for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "authenticated read collections" on public.collections;
drop policy if exists "authenticated write collections" on public.collections;
drop policy if exists "own or admin read collections" on public.collections;
drop policy if exists "admin write collections" on public.collections;
create policy "authenticated read collections" on public.collections for select using (public.is_authenticated());
create policy "admin write collections" on public.collections for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "authenticated read balances" on public.member_month_balances;
drop policy if exists "own or admin read balances" on public.member_month_balances;
drop policy if exists "admin write balances" on public.member_month_balances;
create policy "authenticated read balances" on public.member_month_balances for select using (public.is_authenticated());
create policy "admin write balances" on public.member_month_balances for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "authenticated read settings" on public.settings;
drop policy if exists "admin write settings" on public.settings;
create policy "authenticated read settings" on public.settings for select using (public.is_authenticated());
create policy "admin write settings" on public.settings for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "authenticated audit insert" on public.audit_logs;
drop policy if exists "admin audit read" on public.audit_logs;
create policy "authenticated audit insert" on public.audit_logs for insert with check (auth.uid() = actor_id);
create policy "admin audit read" on public.audit_logs for select using (public.is_admin());

notify pgrst, 'reload schema';
