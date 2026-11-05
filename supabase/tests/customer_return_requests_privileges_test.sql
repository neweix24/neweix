-- Run after 20261105220000_customer_return_requests.sql.
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

  if has_function_privilege('anon', 'public.admin_review_customer_return_request(uuid,uuid,text,text,integer,text,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.admin_review_customer_return_request(uuid,uuid,text,text,integer,text,text)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.admin_review_customer_return_request(uuid,uuid,text,text,integer,text,text)', 'EXECUTE') then
    raise exception 'Admin return review RPC privilege boundary regression.';
  end if;
end;
$test$;
