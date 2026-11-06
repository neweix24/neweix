-- Supreme rider attendance data and mutation RPC must remain server-only.
do $test$
declare
  v_record regprocedure := pg_catalog.to_regprocedure(
    'public.supreme_record_delivery_rider_attendance(uuid,uuid,date,text,timestamp with time zone,timestamp with time zone,text)'
  );
begin
  if v_record is null then
    raise exception 'Supreme rider attendance RPC is missing';
  end if;

  if pg_catalog.has_function_privilege('anon', v_record, 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', v_record, 'EXECUTE')
     or not pg_catalog.has_function_privilege('service_role', v_record, 'EXECUTE') then
    raise exception 'Rider attendance RPC grants are not server-only';
  end if;

  if pg_catalog.has_table_privilege('anon', 'public.neweix_delivery_rider_attendance', 'SELECT')
     or pg_catalog.has_table_privilege('authenticated', 'public.neweix_delivery_rider_attendance', 'SELECT')
     or not pg_catalog.has_table_privilege('service_role', 'public.neweix_delivery_rider_attendance', 'SELECT')
     or not pg_catalog.has_table_privilege('service_role', 'public.neweix_delivery_rider_attendance', 'INSERT')
     or not pg_catalog.has_table_privilege('service_role', 'public.neweix_delivery_rider_attendance', 'UPDATE') then
    raise exception 'Rider attendance table grants are not server-only';
  end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'neweix_rider_attendance_date_idx'
  ) then
    raise exception 'Rider attendance date index is missing';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.neweix_delivery_rider_attendance'::regclass
      and conname = 'neweix_rider_attendance_one_per_day'
  ) then
    raise exception 'One attendance record per rider per day constraint is missing';
  end if;
end;
$test$;
