-- Finance ledger and cost-snapshot security regression checks.
do $test$
declare
  v_expense_fn regprocedure := pg_catalog.to_regprocedure(
    'public.supreme_record_operating_expense(uuid,date,text,integer,text,text,text)'
  );
  v_cost_fn regprocedure := pg_catalog.to_regprocedure(
    'public.supreme_update_product_purchase_cost(uuid,uuid,integer)'
  );
begin
  if v_expense_fn is null or v_cost_fn is null then
    raise exception 'Supreme finance RPC is missing';
  end if;

  if pg_catalog.has_function_privilege('anon', v_expense_fn, 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', v_expense_fn, 'EXECUTE')
     or not pg_catalog.has_function_privilege('service_role', v_expense_fn, 'EXECUTE') then
    raise exception 'Expense RPC grants are not restricted to service_role';
  end if;

  if pg_catalog.has_function_privilege('anon', v_cost_fn, 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', v_cost_fn, 'EXECUTE')
     or not pg_catalog.has_function_privilege('service_role', v_cost_fn, 'EXECUTE') then
    raise exception 'Product cost RPC grants are not restricted to service_role';
  end if;

  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'order_items'
       and column_name = 'purchase_cost_snapshot'
  ) then
    raise exception 'Order item cost snapshot column is missing';
  end if;

  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'public.order_items'::regclass
       and tgname = 'order_items_capture_purchase_cost'
       and not tgisinternal
  ) then
    raise exception 'Order item purchase cost capture trigger is missing';
  end if;
end;
$test$;
