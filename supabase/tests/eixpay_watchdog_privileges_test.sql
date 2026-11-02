-- Run after 20261103050000_eixpay_daily_integrity_watchdog.sql.
do $test$
begin
  if has_function_privilege('anon', 'public.eixpay_verify_integrity_watchdog()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.eixpay_verify_integrity_watchdog()', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.eixpay_verify_integrity_watchdog()', 'EXECUTE') then
    raise exception 'EixPay watchdog RPC privilege boundary regression.';
  end if;

  if has_table_privilege('anon', 'private.eixpay_integrity_watchdog_runs', 'SELECT')
     or has_table_privilege('authenticated', 'private.eixpay_integrity_watchdog_runs', 'SELECT')
     or has_table_privilege('service_role', 'private.eixpay_integrity_watchdog_runs', 'SELECT') then
    raise exception 'EixPay watchdog history table must not be directly readable.';
  end if;
end;
$test$;
