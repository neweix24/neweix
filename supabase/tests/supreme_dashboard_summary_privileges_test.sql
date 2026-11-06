-- The summary RPC must remain inaccessible to browser-facing roles.
do $test$
declare
  v_function regprocedure := pg_catalog.to_regprocedure(
    'public.supreme_dashboard_summary(timestamp with time zone,timestamp with time zone)'
  );
begin
  if v_function is null then
    raise exception 'Supreme dashboard summary RPC is missing';
  end if;

  if pg_catalog.has_function_privilege('anon', v_function, 'EXECUTE') then
    raise exception 'anon must not execute the Supreme dashboard summary RPC';
  end if;

  if pg_catalog.has_function_privilege('authenticated', v_function, 'EXECUTE') then
    raise exception 'authenticated must not execute the Supreme dashboard summary RPC';
  end if;

  if not pg_catalog.has_function_privilege('service_role', v_function, 'EXECUTE') then
    raise exception 'service_role must execute the Supreme dashboard summary RPC';
  end if;
end;
$test$;
