-- Run after all queue lease migrations in a Supabase test database.
do $test$
declare
  v_previous_role text;
  v_previous_claims text;
  v_gate_token uuid;
  v_second_gate_token uuid;
  v_released boolean;
  v_old_claim_count integer;
begin
  if has_function_privilege('anon', 'public.neweix_claim_customer_notifications_v2(integer)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.neweix_claim_customer_notifications_v2(integer)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.neweix_claim_customer_notifications_v2(integer)', 'EXECUTE') then
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

  v_previous_role := current_setting('request.jwt.claim.role', true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'service_role', true);

  select pg_catalog.count(*)::integer into v_old_claim_count
    from public.neweix_claim_customer_notifications(10);
  if v_old_claim_count <> 0 then
    raise exception 'Legacy SMS queue RPC must not claim work during rolling deployment.';
  end if;
  select pg_catalog.count(*)::integer into v_old_claim_count
    from public.neweix_claim_search_embedding_jobs(10);
  if v_old_claim_count <> 0 then
    raise exception 'Legacy search queue RPC must not claim work during rolling deployment.';
  end if;
  if public.neweix_complete_search_embedding_job(gen_random_uuid()) is not false
     or public.neweix_fail_search_embedding_job(gen_random_uuid(), 'legacy test') is not false then
    raise exception 'Legacy search queue mutation RPC must be inert.';
  end if;
  perform public.neweix_complete_customer_notification(gen_random_uuid());
  perform public.neweix_fail_customer_notification(gen_random_uuid(), 'legacy test');
  v_gate_token := public.neweix_acquire_search_embedding_gate(30, 600);
  if v_gate_token is null then
    raise exception 'Search queue gate did not grant the first lease.';
  end if;
  v_second_gate_token := public.neweix_acquire_search_embedding_gate(30, 600);
  if v_second_gate_token is not null then
    raise exception 'Search queue gate allowed concurrent leases.';
  end if;
  v_released := public.neweix_release_search_embedding_gate(v_gate_token);
  if v_released is not true then
    raise exception 'Search queue gate lease could not be released.';
  end if;
  v_second_gate_token := public.neweix_acquire_search_embedding_gate(30, 600);
  if v_second_gate_token is not null then
    raise exception 'Search queue gate did not enforce its minimum start interval.';
  end if;

  -- Supabase may provide the role only inside request.jwt.claims.
  v_previous_claims := current_setting('request.jwt.claims', true);
  perform pg_catalog.set_config('request.jwt.claim.role', '', true);
  perform pg_catalog.set_config('request.jwt.claims', '{"role":"service_role"}', true);
  v_released := public.neweix_release_search_embedding_gate(v_gate_token);
  if v_released is not false then
    raise exception 'Search queue gate accepted an already released lease.';
  end if;
  perform pg_catalog.set_config('request.jwt.claims', coalesce(v_previous_claims, ''), true);
  perform pg_catalog.set_config('request.jwt.claim.role', coalesce(v_previous_role, ''), true);

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
