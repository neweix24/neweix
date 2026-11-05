-- Run after 20261105164959_customer_return_requests.sql.
do $test$
begin
  if not (select relrowsecurity from pg_class where oid = 'public.customer_return_requests'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.customer_return_request_items'::regclass) then
    raise exception 'Customer return request tables must enforce RLS.';
  end if;

  if has_table_privilege('anon', 'public.customer_return_requests', 'SELECT')
     or has_table_privilege('authenticated', 'public.customer_return_requests', 'SELECT')
     or has_table_privilege('anon', 'public.customer_return_request_items', 'SELECT')
     or has_table_privilege('authenticated', 'public.customer_return_request_items', 'SELECT') then
    raise exception 'Customer return request records must remain server-only.';
  end if;

  if has_function_privilege('anon', 'public.customer_create_return_request(uuid,uuid,text,text,jsonb)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.customer_create_return_request(uuid,uuid,text,text,jsonb)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.customer_create_return_request(uuid,uuid,text,text,jsonb)', 'EXECUTE') then
    raise exception 'Customer return creation RPC privilege boundary regression.';
  end if;

  if has_function_privilege('anon', 'public.admin_restock_customer_return_request(uuid,uuid,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.admin_restock_customer_return_request(uuid,uuid,text)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.admin_restock_customer_return_request(uuid,uuid,text)', 'EXECUTE') then
    raise exception 'Admin return restock RPC privilege boundary regression.';
  end if;

  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'customer_return_requests'
       and column_name = 'stock_restocked_at'
  ) then
    raise exception 'Return request inventory restoration state is missing.';
  end if;

  if has_function_privilege('anon', 'public.admin_review_customer_return_request(uuid,uuid,text,text,integer,text,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.admin_review_customer_return_request(uuid,uuid,text,text,integer,text,text)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.admin_review_customer_return_request(uuid,uuid,text,text,integer,text,text)', 'EXECUTE') then
    raise exception 'Admin return review RPC privilege boundary regression.';
  end if;
end;
$test$;
