-- Profit/loss reporting must remain restricted to the server service role.
do $test$
declare
  v_function regprocedure := pg_catalog.to_regprocedure(
    'public.supreme_profit_loss_summary(timestamp with time zone,timestamp with time zone)'
  );
begin
  if v_function is null then
    raise exception 'Supreme profit/loss summary RPC is missing';
  end if;

  if pg_catalog.has_function_privilege('anon', v_function, 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', v_function, 'EXECUTE')
     or not pg_catalog.has_function_privilege('service_role', v_function, 'EXECUTE') then
    raise exception 'Supreme profit/loss RPC must be executable only by service_role';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'orders' and column_name = 'delivered_at'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'orders' and column_name = 'returned_at'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'customer_return_requests' and column_name = 'refunded_at'
  ) then
    raise exception 'Financial event timestamp columns are missing';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.orders'::regclass
      and tgname = 'orders_capture_financial_event_timestamps'
      and not tgisinternal
  ) or not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.customer_return_requests'::regclass
      and tgname = 'customer_return_requests_capture_refunded_at'
      and not tgisinternal
  ) then
    raise exception 'Financial event timestamp triggers are missing';
  end if;
end;
$test$;
