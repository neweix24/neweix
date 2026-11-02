-- Run after 20261103030000_item_level_return_restock.sql.
do $test$
begin
  if has_function_privilege('anon', 'public.admin_restock_returned_order_items(uuid,uuid,text,jsonb)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.admin_restock_returned_order_items(uuid,uuid,text,jsonb)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.admin_restock_returned_order_items(uuid,uuid,text,jsonb)', 'EXECUTE') then
    raise exception 'Partial return restock RPC privilege boundary regression.';
  end if;

  if has_table_privilege('anon', 'public.order_item_return_restocks', 'SELECT')
     or has_table_privilege('authenticated', 'public.order_item_return_restocks', 'SELECT')
     or not has_table_privilege('service_role', 'public.order_item_return_restocks', 'SELECT') then
    raise exception 'Partial return restock ledger privilege boundary regression.';
  end if;
end;
$test$;
