begin;

do $test$
declare
  v_id uuid;
  v_hash text := repeat('a', 64);
  v_ip_hash text := repeat('c', 64);
  v_other_ip_hash text := repeat('d', 64);
  v_previous_role text;
  v_previous_claims text;
begin
  if has_function_privilege('anon', 'public.reserve_supreme_app_attestation_verification_attempt(uuid,text,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.reserve_supreme_app_attestation_verification_attempt(uuid,text,text)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.reserve_supreme_app_attestation_verification_attempt(uuid,text,text)', 'EXECUTE') then
    raise exception 'Supreme attestation attempt reservation privilege boundary regression.';
  end if;

  insert into public.supreme_app_attestation_challenges (
    challenge_hash, requester_ip_hash, expires_at
  ) values (
    v_hash, v_ip_hash, clock_timestamp() + interval '2 minutes'
  ) returning id into v_id;

  v_previous_role := current_setting('request.jwt.claim.role', true);
  v_previous_claims := current_setting('request.jwt.claims', true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'service_role', true);
  perform pg_catalog.set_config('request.jwt.claims', '', true);

  if public.reserve_supreme_app_attestation_verification_attempt(v_id, v_hash, v_other_ip_hash) is not false then
    raise exception 'Supreme attestation attempt reservation ignored requester IP binding.';
  end if;
  if public.reserve_supreme_app_attestation_verification_attempt(v_id, repeat('e', 64), v_ip_hash) is not false then
    raise exception 'Supreme attestation attempt reservation accepted a mismatched challenge hash.';
  end if;

  if public.reserve_supreme_app_attestation_verification_attempt(v_id, v_hash, v_ip_hash) is not true
     or public.reserve_supreme_app_attestation_verification_attempt(v_id, v_hash, v_ip_hash) is not true
     or public.reserve_supreme_app_attestation_verification_attempt(v_id, v_hash, v_ip_hash) is not true then
    raise exception 'Supreme attestation attempt budget did not allow its first three attempts.';
  end if;

  if public.reserve_supreme_app_attestation_verification_attempt(v_id, v_hash, v_ip_hash) is not false then
    raise exception 'Supreme attestation attempt budget allowed more than three attempts.';
  end if;

  if not exists (
    select 1 from public.supreme_app_attestation_challenges
     where id = v_id and verification_attempts = 3
  ) then
    raise exception 'Supreme attestation attempt counter was not persisted correctly.';
  end if;

  perform pg_catalog.set_config('request.jwt.claim.role', coalesce(v_previous_role, ''), true);
  perform pg_catalog.set_config('request.jwt.claims', coalesce(v_previous_claims, ''), true);
end;
$test$;

rollback;
