-- Delivery-cost ledger must remain server-only and use actual recorded amounts only.
do $test$
declare
  v_record_fn regprocedure := pg_catalog.to_regprocedure(
    'public.supreme_record_delivery_cost(uuid,uuid,text,text,text,numeric,date,text,text,text)'
  );
  v_summary_fn regprocedure := pg_catalog.to_regprocedure(
    'public.supreme_delivery_cost_summary(timestamp with time zone,timestamp with time zone)'
  );
begin
  if v_record_fn is null or v_summary_fn is null then
    raise exception 'Supreme delivery cost RPC is missing';
  end if;

  if pg_catalog.pg_get_functiondef(v_record_fn) not like '%p_amount numeric%' then
    raise exception 'Delivery cost write RPC must accept decimal numeric amounts';
  end if;

  if pg_catalog.pg_get_functiondef(v_summary_fn) not like '%::numeric(14,2) as pathao_cost%'
     or pg_catalog.pg_get_functiondef(v_summary_fn) not like '%::numeric(14,2) as own_delivery_cost%'
     or pg_catalog.pg_get_functiondef(v_summary_fn) not like '%::numeric(14,2) as total_cost%' then
    raise exception 'Delivery cost summaries must preserve decimal precision';
  end if;

  if pg_catalog.has_function_privilege('anon', v_record_fn, 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', v_record_fn, 'EXECUTE')
     or not pg_catalog.has_function_privilege('service_role', v_record_fn, 'EXECUTE') then
    raise exception 'Delivery cost write RPC grants are not restricted to service_role';
  end if;

  if pg_catalog.has_function_privilege('anon', v_summary_fn, 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', v_summary_fn, 'EXECUTE')
     or not pg_catalog.has_function_privilege('service_role', v_summary_fn, 'EXECUTE') then
    raise exception 'Delivery cost summary RPC grants are not restricted to service_role';
  end if;

  if pg_catalog.has_table_privilege('anon', 'public.delivery_cost_entries', 'SELECT')
     or pg_catalog.has_table_privilege('authenticated', 'public.delivery_cost_entries', 'SELECT')
     or not pg_catalog.has_table_privilege('service_role', 'public.delivery_cost_entries', 'SELECT')
     or not pg_catalog.has_table_privilege('service_role', 'public.delivery_cost_entries', 'INSERT') then
    raise exception 'Delivery cost ledger grants are not restricted to service_role';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'pathao_settlement_delivery_cost_sync'
      and tgrelid = 'public.pathao_settlement_rows'::regclass
      and not tgisinternal
  ) then
    raise exception 'Automatic Pathao settlement-to-ledger trigger is missing';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'delivery_cost_entries'
      and column_name = 'amount' and data_type = 'numeric'
  ) then
    raise exception 'Delivery cost amount must preserve settlement decimal precision';
  end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'delivery_cost_settlement_row_uidx'
  ) then
    raise exception 'Pathao settlement rows must be idempotently linked to delivery cost entries';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'delivery_cost_entries'
      and column_name = 'settlement_row_id'
  ) then
    raise exception 'Delivery cost settlement source link is missing';
  end if;
end;
$test$;
