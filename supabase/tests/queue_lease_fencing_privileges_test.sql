-- Run after all queue lease migrations in a Supabase test database.
do $test$
begin
  if not has_function_privilege('anon', 'public.neweix_claim_customer_notifications(integer)', 'EXECUTE')
     and not has_function_privilege('authenticated', 'public.neweix_claim_customer_notifications(integer)', 'EXECUTE')
     and has_function_privilege('service_role', 'public.neweix_claim_customer_notifications(integer)', 'EXECUTE')
     and has_function_privilege('anon', 'public.neweix_save_search_embedding(uuid,uuid,uuid,extensions.vector,text)', 'EXECUTE') = false
     and has_function_privilege('authenticated', 'public.neweix_save_search_embedding(uuid,uuid,uuid,extensions.vector,text)', 'EXECUTE') = false
     and has_function_privilege('service_role', 'public.neweix_save_search_embedding(uuid,uuid,uuid,extensions.vector,text)', 'EXECUTE') then
    raise notice 'Queue RPC privilege boundaries passed.';
  else
    raise exception 'Queue RPC privilege boundary regression.';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'neweix_save_search_embedding'
      and p.proargnames = array['p_job_id','p_product_id','p_lease_token','p_embedding','p_model']
  ) then
    raise exception 'Atomic search embedding RPC signature missing.';
  end if;
end;
$test$;
