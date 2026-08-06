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
  on conflict(year, month) do update set opening_cash = excluded.opening_cash, closing_cash = excluded.closing_cash
  returning id into v_next_id;
  insert into member_month_balances(member_id, month_id, opening_balance, closing_balance)
  select member_id, v_next_id, closing_balance, closing_balance from member_month_balances where month_id = p_month_id
  on conflict(member_id, month_id) do update set opening_balance = excluded.opening_balance, closing_balance = excluded.closing_balance;
end;
$$;
