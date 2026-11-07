begin;

do $test$
declare
  v_id uuid;
  v_expired_id uuid;
  v_hash text := repeat('a', 64);
  v_expired_hash text := repeat('b', 64);
  v_previous_role text;
  v_previous_claims text;
begin
  -- Challenge issuance must reject SQL NULLs explicitly with a stable input error.
  begin
    perform public.issue_supreme_app_attestation_challenge(
      null, repeat('a', 64), clock_timestamp() + interval '2 minutes'
    );
    raise exception 'Challenge issuance accepted a NULL challenge hash.';
  exception when sqlstate '22023' then
    null;
  end;
  begin
    perform public.issue_supreme_app_attestation_challenge(
      repeat('a', 64), null, clock_timestamp() + interval '2 minutes'
    );
    raise exception 'Challenge issuance accepted a NULL requester hash.';
  exception when sqlstate '22023' then
    null;
  end;
  begin
    perform public.issue_supreme_app_attestation_challenge(
      repeat('a', 64), repeat('b', 64), null
    );
    raise exception 'Challenge issuance accepted a NULL expiry.';
  exception when sqlstate '22023' then
    null;
  end;
  begin
    perform public.issue_supreme_app_attestation_challenge(
      repeat('a', 64), repeat('b', 64), clock_timestamp() + interval '6 minutes'
    );
    raise exception 'Challenge issuance accepted an excessive expiry.';
  exception when sqlstate '22023' then
    null;
  end;

  if has_function_privilege('anon', 'public.issue_supreme_app_attestation_challenge(text,text,timestamptz)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.issue_supreme_app_attestation_challenge(text,text,timestamptz)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.issue_supreme_app_attestation_challenge(text,text,timestamptz)', 'EXECUTE') then
    raise exception 'Supreme attestation challenge issuance privilege boundary regression.';
  end if;

  if has_function_privilege('anon', 'public.consume_supreme_app_attestation_challenge(uuid,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.consume_supreme_app_attestation_challenge(uuid,text)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.consume_supreme_app_attestation_challenge(uuid,text)', 'EXECUTE') then
    raise exception 'Supreme attestation challenge consumption privilege boundary regression.';
  end if;

  if has_table_privilege('anon', 'public.supreme_app_attestation_challenges', 'SELECT')
     or has_table_privilege('authenticated', 'public.supreme_app_attestation_challenges', 'SELECT') then
    raise exception 'Client roles must not read Supreme attestation challenges.';
  end if;

  insert into public.supreme_app_attestation_challenges (
    challenge_hash, requester_ip_hash, expires_at
  ) values (
    v_hash, repeat('c', 64), clock_timestamp() + interval '2 minutes'
  ) returning id into v_id;

  insert into public.supreme_app_attestation_challenges (
    challenge_hash, requester_ip_hash, created_at, expires_at
  ) values (
    v_expired_hash,
    repeat('d', 64),
    clock_timestamp() - interval '10 minutes',
    clock_timestamp() - interval '1 second'
  ) returning id into v_expired_id;

  v_previous_role := current_setting('request.jwt.claim.role', true);
  v_previous_claims := current_setting('request.jwt.claims', true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'service_role', true);
  perform pg_catalog.set_config('request.jwt.claims', '', true);

  if public.consume_supreme_app_attestation_challenge(v_id, repeat('e', 64)) is not false then
    raise exception 'Supreme attestation challenge accepted a mismatched hash.';
  end if;
  if public.consume_supreme_app_attestation_challenge(v_expired_id, v_expired_hash) is not false then
    raise exception 'Supreme attestation challenge accepted an expired challenge.';
  end if;
  if public.consume_supreme_app_attestation_challenge(v_id, null) is not false
     or public.consume_supreme_app_attestation_challenge(v_id, 'invalid') is not false then
    raise exception 'Supreme attestation challenge accepted malformed input.';
  end if;
  if public.consume_supreme_app_attestation_challenge(v_id, v_hash) is not true then
    raise exception 'Supreme attestation challenge could not be consumed once.';
  end if;
  if public.consume_supreme_app_attestation_challenge(v_id, v_hash) is not false then
    raise exception 'Supreme attestation challenge replay was not rejected.';
  end if;
  if not exists (
    select 1 from public.supreme_app_attestation_challenges
     where id = v_id and consumed_at is not null
  ) then
    raise exception 'Supreme attestation challenge consumption timestamp was not stored.';
  end if;

  perform pg_catalog.set_config('request.jwt.claim.role', coalesce(v_previous_role, ''), true);
  perform pg_catalog.set_config('request.jwt.claims', coalesce(v_previous_claims, ''), true);
end;
$test$;

rollback;
