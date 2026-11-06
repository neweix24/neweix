begin;
do $test$
declare
  v_count integer;
  v_function regprocedure;
  v_definition text;
begin
  select count(*) into v_count from public.neweix_delivery_zones
   where district_code='BD-D08-Z62' and upazila_code in (
     'BD-D08-Z62-U462','BD-D08-Z62-U463','BD-D08-Z62-U464',
     'BD-D08-Z62-U465','BD-D08-Z62-U466','BD-D08-Z62-U467',
     'BD-D08-Z62-U468','BD-D08-Z62-U469','BD-D08-Z62-U470',
     'BD-D08-Z62-U471','BD-D08-Z62-U472','BD-D08-Z62-U473','BD-D08-Z62-U474'
   );
  if v_count<>13 then raise exception 'NEWEIX_MYMENSINGH_MUST_HAVE_13_CONFIGURABLE_UPAZILAS'; end if;
  if exists(select 1 from public.neweix_delivery_zones where is_active and delivery_fee is null) then
    raise exception 'ACTIVE_ZONE_WITHOUT_CONFIGURED_FEE';
  end if;
  v_function := 'public.create_order_with_neweix_delivery(text,text,text,text,text,text,text,jsonb,text,uuid,text,text,text,text,text,text,text,text,text,text,text,text,uuid)'::regprocedure;
  if has_function_privilege('anon',v_function,'EXECUTE')
     or has_function_privilege('authenticated',v_function,'EXECUTE')
     or not has_function_privilege('service_role',v_function,'EXECUTE') then
    raise exception 'NEWEIX_DELIVERY_RPC_GRANTS_REGRESSION';
  end if;
  if has_table_privilege('anon','public.neweix_delivery_zones','SELECT')
     or has_table_privilege('authenticated','public.neweix_delivery_zones','SELECT')
     or not has_table_privilege('service_role','public.neweix_delivery_zones','SELECT') then
    raise exception 'NEWEIX_DELIVERY_ZONE_GRANTS_REGRESSION';
  end if;
  select pg_get_constraintdef(oid) into v_definition from pg_constraint
   where conrelid='public.orders'::regclass and conname='orders_delivery_provider_check';
  if v_definition is null or position('neweix_own' in v_definition)=0 then
    raise exception 'ORDERS_PROVIDER_CONSTRAINT_MISSING_NEWEIX_OWN';
  end if;
  select pg_get_constraintdef(oid) into v_definition from pg_constraint
   where conrelid='public.order_fulfillments'::regclass and conname='order_fulfillments_provider_check';
  if v_definition is null or position('neweix_own' in v_definition)=0 then
    raise exception 'FULFILLMENTS_PROVIDER_CONSTRAINT_MISSING_NEWEIX_OWN';
  end if;
end;
$test$;
rollback;
