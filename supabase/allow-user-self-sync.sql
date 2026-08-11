drop policy if exists "profiles self insert" on public.profiles;
drop policy if exists "profiles self update" on public.profiles;
create policy "profiles self insert" on public.profiles
for insert with check (auth.uid() = id);
create policy "profiles self update" on public.profiles
for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "members self insert" on public.members;
drop policy if exists "members self update" on public.members;
create policy "members self insert" on public.members
for insert with check (auth.uid() = user_id);
create policy "members self update" on public.members
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

notify pgrst, 'reload schema';
