-- Run after all queue lease migrations in a Supabase test database.
do $test$
begin
  if has_function_privilege('anon', 'public.neweix_claim_customer_notifications(integer)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.neweix_claim_customer_notifications(integer)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.neweix_claim_customer_notifications(integer)', 'EXECUTE') then
    raise exception 'Customer SMS queue RPC privilege boundary regression.';
  end if;

  if has_function_privilege('anon', 'public.neweix_save_search_embedding(uuid,uuid,uuid,extensions.vector,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.neweix_save_search_embedding(uuid,uuid,uuid,extensions.vector,text)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.neweix_save_search_embedding(uuid,uuid,uuid,extensions.vector,text)', 'EXECUTE') then
    raise exception 'Search embedding RPC privilege boundary regression.';
  end if;

  if has_function_privilege('anon', 'public.neweix_enqueue_search_embedding_batch(integer,integer)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.neweix_enqueue_search_embedding_batch(integer,integer)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.neweix_enqueue_search_embedding_batch(integer,integer)', 'EXECUTE') then
    raise exception 'Search reindex enqueue RPC privilege boundary regression.';
  end if;

  if has_function_privilege('anon', 'public.neweix_acquire_search_embedding_gate(integer,integer)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.neweix_acquire_search_embedding_gate(integer,integer)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.neweix_acquire_search_embedding_gate(integer,integer)', 'EXECUTE')
     or has_function_privilege('anon', 'public.neweix_release_search_embedding_gate(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.neweix_release_search_embedding_gate(uuid)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.neweix_release_search_embedding_gate(uuid)', 'EXECUTE') then
    raise exception 'Search queue global rate-gate privilege boundary regression.';
  end if;

  if has_table_privilege('anon', 'private.search_embedding_processor_gate', 'SELECT')
     or has_table_privilege('authenticated', 'private.search_embedding_processor_gate', 'SELECT')
     or has_table_privilege('service_role', 'private.search_embedding_processor_gate', 'SELECT') then
    raise exception 'Search queue global rate-gate table must not be directly readable.';
  end if;

  if not exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'neweix_save_search_embedding'
       and p.proargnames = array['p_job_id','p_product_id','p_lease_token','p_embedding','p_model']
  ) then
    raise exception 'Atomic search embedding RPC signature missing.';
  end if;
end;
$test$;
