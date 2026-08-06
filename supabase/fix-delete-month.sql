-- ONE script to run in the Supabase SQL editor that fixes:
--  1. Month deletion (P0001 'Month is locked'): delete_month disables the
--     locked-month guard triggers while deleting, and re-enables them safely.
--  2. prevent_locked_month_edits now only blocks edits when the month still
--     exists and is locked (so cascade deletes are allowed).
--  3. Only one month open at a time: locks every open month except the latest
--     and adds a partial unique index enforcing it.
--  4. close_month re-opens the next month even if a row already exists.

-- 1 + 2 ---------------------------------------------------------------
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

-- 3 --------------------------------------------------------------------
update months m
set status = 'locked', closed_at = coalesce(m.closed_at, now())
where m.status = 'open'
  and m.id <> (select id from months where status = 'open' order by year desc, month desc limit 1);

create unique index if not exists one_open_month on months ((1)) where status = 'open';

-- 4 --------------------------------------------------------------------
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
