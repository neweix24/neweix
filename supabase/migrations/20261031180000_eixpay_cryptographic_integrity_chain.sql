-- NEWEIX EixPay cryptographic integrity chain (stage 1).
-- This is tamper-evident against ordinary application roles, NOT against a
-- privileged database owner. Independent Ed25519 checkpoint signing is stage 2.
--
-- Existing rows are intentionally not backfilled. The chain starts with the
-- first ledger/audit INSERT after this migration is applied.

do $check$
begin
  if to_regprocedure('extensions.digest(bytea,text)') is null then
    raise exception 'EIXPAY_INTEGRITY_REQUIRES_PGCRYPTO';
  end if;
end;
$check$;

create table if not exists private.eixpay_integrity_chain_state (
  singleton boolean primary key default true check (singleton),
  last_sequence bigint not null default 0 check (last_sequence >= 0),
  last_hash text not null default repeat('0', 64)
    check (last_hash ~ '^[0-9a-f]{64}$'),
  updated_at timestamptz not null default now()
);

insert into private.eixpay_integrity_chain_state(singleton)
values (true)
on conflict (singleton) do nothing;

create table if not exists private.eixpay_integrity_events (
  sequence bigint primary key,
  source_table text not null
    check (source_table in ('eixpay_ledger', 'eixpay_audit_events')),
  source_id bigint not null,
  event_payload jsonb not null
    check (jsonb_typeof(event_payload) = 'object'),
  previous_hash text not null check (previous_hash ~ '^[0-9a-f]{64}$'),
  event_hash text not null unique check (event_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  unique (source_table, source_id)
);

alter table private.eixpay_integrity_chain_state enable row level security;
alter table private.eixpay_integrity_events enable row level security;

revoke all on table private.eixpay_integrity_chain_state
  from public, anon, authenticated, service_role;
revoke all on table private.eixpay_integrity_events
  from public, anon, authenticated, service_role;

drop policy if exists eixpay_integrity_state_no_direct_access
  on private.eixpay_integrity_chain_state;
create policy eixpay_integrity_state_no_direct_access
  on private.eixpay_integrity_chain_state
  for all to anon, authenticated using (false) with check (false);

drop policy if exists eixpay_integrity_events_no_direct_access
  on private.eixpay_integrity_events;
create policy eixpay_integrity_events_no_direct_access
  on private.eixpay_integrity_events
  for all to anon, authenticated using (false) with check (false);

drop trigger if exists eixpay_integrity_events_append_only
  on private.eixpay_integrity_events;
create trigger eixpay_integrity_events_append_only
before update or delete on private.eixpay_integrity_events
for each row execute function private.prevent_eixpay_audit_mutation();

create or replace function private.eixpay_append_integrity_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_sequence bigint;
  v_previous_hash text;
  v_payload jsonb := to_jsonb(new);
  v_source_table text := tg_table_name;
  v_source_id bigint;
  v_event_hash text;
begin
  if tg_table_schema <> 'private'
     or v_source_table not in ('eixpay_ledger', 'eixpay_audit_events') then
    raise exception using errcode = '22023',
      message = 'EIXPAY_INTEGRITY_UNSUPPORTED_SOURCE';
  end if;

  v_source_id := (v_payload ->> 'id')::bigint;
  if v_source_id is null then
    raise exception using errcode = '22023',
      message = 'EIXPAY_INTEGRITY_SOURCE_ID_REQUIRED';
  end if;

  -- A single locked state row gives the mixed ledger/audit stream a strict,
  -- transaction-safe total order. Rollback also rolls back the chain update.
  insert into private.eixpay_integrity_chain_state(singleton)
  values (true)
  on conflict (singleton) do nothing;

  select last_sequence, last_hash
    into v_sequence, v_previous_hash
  from private.eixpay_integrity_chain_state
  where singleton = true
  for update;

  v_sequence := v_sequence + 1;
  v_event_hash := encode(
    extensions.digest(
      convert_to(v_previous_hash || '|' || v_payload::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  insert into private.eixpay_integrity_events(
    sequence, source_table, source_id, event_payload,
    previous_hash, event_hash
  )
  values (
    v_sequence, v_source_table, v_source_id, v_payload,
    v_previous_hash, v_event_hash
  );

  update private.eixpay_integrity_chain_state
  set last_sequence = v_sequence,
      last_hash = v_event_hash,
      updated_at = now()
  where singleton = true;

  return new;
end;
$function$;

revoke all on function private.eixpay_append_integrity_event()
  from public, anon, authenticated, service_role;

drop trigger if exists eixpay_ledger_integrity_chain
  on private.eixpay_ledger;
create trigger eixpay_ledger_integrity_chain
after insert on private.eixpay_ledger
for each row execute function private.eixpay_append_integrity_event();

drop trigger if exists eixpay_audit_integrity_chain
  on private.eixpay_audit_events;
create trigger eixpay_audit_integrity_chain
after insert on private.eixpay_audit_events
for each row execute function private.eixpay_append_integrity_event();

create or replace function public.eixpay_verify_integrity()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_event record;
  v_expected_previous text := repeat('0', 64);
  v_expected_hash text;
  v_current_payload jsonb;
  v_checked bigint := 0;
  v_first_invalid bigint;
  v_reason text;
  v_state private.eixpay_integrity_chain_state%rowtype;
begin
  if auth.uid() is null
     or not private.has_staff_role(array['supreme']::text[])
     or coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
    raise exception using errcode = '42501',
      message = 'SUPREME_MFA_REQUIRED';
  end if;

  -- Hold a shared lock for the full verification pass. Insert triggers need
  -- FOR UPDATE on this row, so the verifier sees a stable, complete chain.
  select * into v_state
  from private.eixpay_integrity_chain_state
  where singleton = true
  for share;

  for v_event in
    select sequence, source_table, source_id, event_payload,
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

    v_expected_hash := encode(
      extensions.digest(
        convert_to(v_expected_previous || '|' || v_event.event_payload::text, 'UTF8'),
        'sha256'
      ),
      'hex'
    );

    if v_expected_hash <> v_event.event_hash then
      v_first_invalid := v_event.sequence;
      v_reason := 'EVENT_HASH_MISMATCH';
      exit;
    end if;

    if v_event.source_table = 'eixpay_ledger' then
      select to_jsonb(l) into v_current_payload
      from private.eixpay_ledger l
      where l.id = v_event.source_id;
    else
      select to_jsonb(a) into v_current_payload
      from private.eixpay_audit_events a
      where a.id = v_event.source_id;
    end if;

    if v_current_payload is distinct from v_event.event_payload then
      v_first_invalid := v_event.sequence;
      v_reason := 'SOURCE_ROW_MISMATCH';
      exit;
    end if;

    v_expected_previous := v_expected_hash;
  end loop;

  if v_first_invalid is null
     and (v_state.last_sequence <> v_checked
          or v_state.last_hash <> v_expected_previous) then
    v_reason := 'CHAIN_STATE_MISMATCH';
  end if;

  return jsonb_build_object(
    'valid', v_reason is null,
    'checked_events', v_checked,
    'last_verified_hash', v_expected_previous,
    'first_invalid_sequence', v_first_invalid,
    'failure_reason', v_reason,
    'verified_at', now(),
    'independent_signature', false
  );
end;
$function$;

revoke all on function public.eixpay_verify_integrity()
  from public, anon;
grant execute on function public.eixpay_verify_integrity()
  to authenticated;

comment on table private.eixpay_integrity_events is
  'SHA-256 hash chain for new EixPay ledger and audit inserts. Detects ordinary-role tampering; not protection against privileged database owner without external signatures.';
comment on function public.eixpay_verify_integrity() is
  'Supreme AAL2-only verifier for the EixPay ledger/audit SHA-256 chain. Does not provide independent signature verification.';
