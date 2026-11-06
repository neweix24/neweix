-- Regression tests for the Supreme operational notification inbox.
do $test$
declare
  v_table regclass := pg_catalog.to_regclass('public.supreme_notifications');
  v_order_trigger boolean;
  v_stock_trigger boolean;
  v_order_fn regprocedure := pg_catalog.to_regprocedure('private.create_supreme_order_notifications()');
  v_stock_fn regprocedure := pg_catalog.to_regprocedure('private.create_supreme_low_stock_notification()');
begin
  if v_table is null then
    raise exception 'Supreme notification table is missing';
  end if;

  if not exists (
    select 1 from pg_class
    where oid = v_table and relrowsecurity = true
  ) then
    raise exception 'Supreme notification RLS must be enabled';
  end if;

  if pg_catalog.has_table_privilege('anon', v_table, 'SELECT')
     or pg_catalog.has_table_privilege('authenticated', v_table, 'SELECT')
     or pg_catalog.has_table_privilege('authenticated', v_table, 'INSERT')
     or pg_catalog.has_table_privilege('authenticated', v_table, 'UPDATE') then
    raise exception 'Supreme notifications must not be directly accessible to browser roles';
  end if;

  if not pg_catalog.has_table_privilege('service_role', v_table, 'SELECT')
     or not pg_catalog.has_table_privilege('service_role', v_table, 'INSERT')
     or not pg_catalog.has_table_privilege('service_role', v_table, 'UPDATE') then
    raise exception 'Service role notification privileges are incomplete';
  end if;

  select exists (
    select 1 from pg_trigger
    where tgrelid = 'public.orders'::regclass
      and tgname = 'orders_create_supreme_notifications'
      and not tgisinternal
  ) into v_order_trigger;

  select exists (
    select 1 from pg_trigger
    where tgrelid = 'public.products'::regclass
      and tgname = 'products_create_supreme_low_stock_notification'
      and not tgisinternal
  ) into v_stock_trigger;

  if not v_order_trigger or not v_stock_trigger then
    raise exception 'Supreme order or low-stock notification trigger is missing';
  end if;

  if v_order_fn is null or v_stock_fn is null then
    raise exception 'Supreme notification trigger function is missing';
  end if;

  if pg_catalog.has_function_privilege('anon', v_order_fn, 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', v_order_fn, 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', v_stock_fn, 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', v_stock_fn, 'EXECUTE') then
    raise exception 'Supreme notification trigger functions must not be executable by browser roles';
  end if;
end;
$test$;
