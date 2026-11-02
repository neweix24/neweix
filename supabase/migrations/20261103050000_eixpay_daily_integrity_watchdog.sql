-- Daily service-role watchdog for the database-local EixPay SHA-256 chain.
-- This detects changes to covered rows/events; it is not an external signature.
begin;

create table if not exists private.eixpay_integrity_watchdog_runs (
  id bigint generated always as identity primary key,
  valid boolean not null,
  checked_events bigint not null default 0,
  last_verified_hash text,
  first_invalid_sequence bigint,
  failure_reason text,
  independent_signature boolean not null default false,
  created_at timestamptz not null default pg_catalog.now()
);

create index if not exists eixpay_integrity_watchdog_runs_created_idx
  on private.eixpay_integrity_watchdog_runs(created_at desc);

alter table private.eixpay_integrity_watchdog_runs enable row level security;
revoke all on table private.eixpay_integrity_watchdog_runs
  from public, anon, authenticated, service_role;

create or replace function private.eixpay_verify_integrity_internal()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_event record;
  v_expected_previous text := pg_catalog.repeat('0', 64);
  v_expected_hash text;
  v_current_payload jsonb;
  v_source_hash text;
  v_checked bigint := 0;
  v_first_invalid bigint;
  v_reason text;
  v_state private.eixpay_integrity_chain_state%rowtype;
begin
  select * into v_state
    from private.eixpay_integrity_chain_state
   where singleton = true
   for share;

  if not found then
    return pg_catalog.jsonb_build_object(
      'valid', false,
      'checked_events', 0,
      'last_verified_hash', v_expected_previous,
      'first_invalid_sequence', null,
      'failure_reason', 'CHAIN_STATE_MISSING',
      'verified_at', pg_catalog.now(),
      'independent_signature', false
    );
  end if;

  for v_event in
    select sequence, source_table, source_id, source_hash,
           previous_hash, event_hash
      from private.eixpay_integrity_events
     order by sequence asc
  loop
    v_checked := v_checked + 1;

    if v_event.sequence <> v_checked then
      v_first_invalid := v_event.sequence;
      v_reason := 'SEQUENCE_GAP';
      exit;
    end if;

    if v_event.previous_hash <> v_expected_previous then
      v_first_invalid := v_event.sequence;
      v_reason := 'PREVIOUS_HASH_MISMATCH';
      exit;
    end if;

    if v_event.source_table = 'eixpay_ledger' then
      select pg_catalog.to_jsonb(l) into v_current_payload
        from private.eixpay_ledger l
       where l.id = v_event.source_id;
    elsif v_event.source_table = 'eixpay_audit_events' then
      select pg_catalog.to_jsonb(a) into v_current_payload
        from private.eixpay_audit_events a
       where a.id = v_event.source_id;
    else
      v_first_invalid := v_event.sequence;
      v_reason := 'UNSUPPORTED_SOURCE_TABLE';
      exit;
    end if;

    if v_current_payload is null then
      v_first_invalid := v_event.sequence;
      v_reason := 'SOURCE_ROW_MISSING';
      exit;
    end if;

    v_source_hash := pg_catalog.encode(
      extensions.digest(
        pg_catalog.convert_to(v_current_payload::text, 'UTF8'),
        'sha256'
      ),
      'hex'
    );
    if v_source_hash <> v_event.source_hash then
      v_first_invalid := v_event.sequence;
      v_reason := 'SOURCE_ROW_MISMATCH';
      exit;
    end if;

    v_expected_hash := pg_catalog.encode(
      extensions.digest(
        pg_catalog.convert_to(
          v_expected_previous || '|' || v_event.source_table || '|' ||
          v_event.source_id::text || '|' || v_event.source_hash,
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    );
    if v_expected_hash <> v_event.event_hash then
      v_first_invalid := v_event.sequence;
      v_reason := 'EVENT_HASH_MISMATCH';
      exit;
    end if;

    v_expected_previous := v_expected_hash;
  end loop;

  if v_reason is null
     and (v_state.last_sequence <> v_checked
          or v_state.last_hash <> v_expected_previous) then
    v_reason := 'CHAIN_STATE_MISMATCH';
  end if;

  return pg_catalog.jsonb_build_object(
    'valid', v_reason is null,
    'checked_events', v_checked,
    'last_verified_hash', v_expected_previous,
    'first_invalid_sequence', v_first_invalid,
    'failure_reason', v_reason,
    'verified_at', pg_catalog.now(),
    'independent_signature', false
  );
end;
$function$;

revoke all on function private.eixpay_verify_integrity_internal()
  from public, anon, authenticated, service_role;

create or replace function public.eixpay_verify_integrity()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null
     or not private.has_staff_role(array['supreme']::text[])
     or coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
    raise exception using errcode = '42501',
      message = 'SUPREME_MFA_REQUIRED';
  end if;
  return private.eixpay_verify_integrity_internal();
end;
$function$;

revoke all on function public.eixpay_verify_integrity()
  from public, anon;
grant execute on function public.eixpay_verify_integrity()
  to authenticated;

create or replace function public.eixpay_verify_integrity_watchdog()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_result jsonb;
  v_run_id bigint;
begin
  if current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  v_result := private.eixpay_verify_integrity_internal();

  insert into private.eixpay_integrity_watchdog_runs(
    valid, checked_events, last_verified_hash,
    first_invalid_sequence, failure_reason, independent_signature
  )
  values (
    coalesce((v_result->>'valid')::boolean, false),
    coalesce((v_result->>'checked_events')::bigint, 0),
    v_result->>'last_verified_hash',
    nullif(v_result->>'first_invalid_sequence', '')::bigint,
    v_result->>'failure_reason',
    false
  )
  returning id into v_run_id;

  delete from private.eixpay_integrity_watchdog_runs
   where created_at < pg_catalog.now() - interval '400 days';

  return v_result || pg_catalog.jsonb_build_object('watchdog_run_id', v_run_id);
end;
$function$;

revoke all on function public.eixpay_verify_integrity_watchdog()
  from public, anon, authenticated;
grant execute on function public.eixpay_verify_integrity_watchdog()
  to service_role;

commit;
