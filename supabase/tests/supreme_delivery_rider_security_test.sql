-- Supreme rider directory and payout operations must be server-only.
do $test$
declare
  v_create regprocedure := pg_catalog.to_regprocedure('public.supreme_create_delivery_rider(uuid,text,text,text)');
  v_assign regprocedure := pg_catalog.to_regprocedure('public.supreme_assign_delivery_rider(uuid,uuid,uuid)');
  v_pay regprocedure := pg_catalog.to_regprocedure('public.supreme_record_rider_payment(uuid,uuid,uuid,numeric,date,text,text,text)');
  v_summary regprocedure := pg_catalog.to_regprocedure('public.supreme_delivery_rider_payout_summary()');
  v_report regprocedure := pg_catalog.to_regprocedure('public.supreme_delivery_rider_daily_report(date,date)');
begin
  if v_create is null or v_assign is null or v_pay is null or v_summary is null or v_report is null then
    raise exception 'Supreme rider RPC is missing';
  end if;
  if pg_catalog.has_function_privilege('anon',v_create,'EXECUTE') or pg_catalog.has_function_privilege('authenticated',v_create,'EXECUTE')
     or not pg_catalog.has_function_privilege('service_role',v_create,'EXECUTE') then
    raise exception 'Rider creation RPC grants are not server-only';
  end if;
  if pg_catalog.has_function_privilege('anon',v_assign,'EXECUTE') or pg_catalog.has_function_privilege('authenticated',v_assign,'EXECUTE')
     or not pg_catalog.has_function_privilege('service_role',v_assign,'EXECUTE') then
    raise exception 'Rider assignment RPC grants are not server-only';
  end if;
  if pg_catalog.has_function_privilege('anon',v_pay,'EXECUTE') or pg_catalog.has_function_privilege('authenticated',v_pay,'EXECUTE')
     or not pg_catalog.has_function_privilege('service_role',v_pay,'EXECUTE') then
    raise exception 'Rider payment RPC grants are not server-only';
  end if;
  if pg_catalog.has_function_privilege('anon',v_summary,'EXECUTE') or pg_catalog.has_function_privilege('authenticated',v_summary,'EXECUTE')
     or not pg_catalog.has_function_privilege('service_role',v_summary,'EXECUTE') then
    raise exception 'Rider payout summary RPC grants are not server-only';
  end if;
  if pg_catalog.has_function_privilege('anon',v_report,'EXECUTE') or pg_catalog.has_function_privilege('authenticated',v_report,'EXECUTE')
     or not pg_catalog.has_function_privilege('service_role',v_report,'EXECUTE') then
    raise exception 'Rider daily report RPC grants are not server-only';
  end if;
  if pg_catalog.has_table_privilege('anon','public.neweix_delivery_rider_assignments','SELECT')
     or pg_catalog.has_table_privilege('authenticated','public.neweix_delivery_rider_assignments','SELECT')
     or not pg_catalog.has_table_privilege('service_role','public.neweix_delivery_rider_assignments','SELECT') then
    raise exception 'Rider assignment history grants are not server-only';
  end if;
  if not exists(select 1 from pg_trigger where tgname='track_neweix_delivery_rider_assignment' and tgrelid='public.orders'::regclass and not tgisinternal) then
    raise exception 'Rider assignment history trigger is missing';
  end if;
  if pg_catalog.has_table_privilege('anon','public.neweix_delivery_riders','SELECT')
     or pg_catalog.has_table_privilege('authenticated','public.neweix_delivery_riders','SELECT')
     or not pg_catalog.has_table_privilege('service_role','public.neweix_delivery_riders','SELECT') then
    raise exception 'Rider directory table grants are not server-only';
  end if;
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='orders' and column_name='neweix_delivery_rider_id')
     or not exists(select 1 from information_schema.columns where table_schema='public' and table_name='delivery_cost_entries' and column_name='rider_id') then
    raise exception 'Rider assignment or payout attribution columns are missing';
  end if;
end;
$test$;
