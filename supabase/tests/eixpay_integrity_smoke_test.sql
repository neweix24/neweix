-- Disposable local PostgreSQL smoke/behavior test. All inserted rows are rolled back.
begin;

do $test$
declare
  v_config record;
  v_rule_count integer;
  v_before bigint;
  v_after bigint;
  v_ledger_id bigint;
  v_audit_id bigint;
  v_event_count integer;
  v_chain_hash text;
  v_expected_hash text;
  v_payload jsonb;
begin
  if to_regclass('private.eixpay_config') is null
     or to_regclass('private.eixpay_wallets') is null
     or to_regclass('private.eixpay_ledger') is null
     or to_regclass('private.eixpay_audit_events') is null
     or to_regclass('private.eixpay_integrity_events') is null
     or to_regclass('private.eixverse_campaigns') is null
     or to_regclass('private.eixpay_product_reviews') is null
     or to_regclass('private.eixpay_referrals') is null then
    raise exception 'EIXPAY_REQUIRED_TABLE_MISSING';
  end if;

  select * into v_config from private.eixpay_config where singleton = true;
  if not found or not v_config.wallet_enabled
     or v_config.earning_enabled
     or v_config.redemption_enabled
     or v_config.transfer_enabled then
    raise exception 'EIXPAY_UNSAFE_DEFAULT_CONFIGURATION';
  end if;

  select count(*) into v_rule_count
  from private.eixpay_reward_rules
  where enabled;
  if v_rule_count <> 0 then
    raise exception 'EIXPAY_REWARD_RULES_MUST_DEFAULT_DISABLED';
  end if;

  if not (select relrowsecurity from pg_class where oid='private.eixpay_ledger'::regclass)
     or not (select relrowsecurity from pg_class where oid='private.eixpay_integrity_events'::regclass) then
    raise exception 'EIXPAY_RLS_NOT_ENABLED';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid='private.eixpay_ledger'::regclass
      and tgname='eixpay_ledger_integrity_chain' and not tgisinternal
  ) or not exists (
    select 1 from pg_trigger
    where tgrelid='private.eixpay_audit_events'::regclass
      and tgname='eixpay_audit_integrity_chain' and not tgisinternal
  ) then
    raise exception 'EIXPAY_INTEGRITY_TRIGGER_MISSING';
  end if;

  select last_sequence into v_before
  from private.eixpay_integrity_chain_state where singleton=true;

  insert into private.eixpay_ledger
    (wallet_user_id,entry_kind,event_code,amount,balance_after,idempotency_key)
  values
    (gen_random_uuid(),'credit','ci_integrity_smoke',1,1,'ci-integrity-smoke-'||gen_random_uuid())
  returning id into v_ledger_id;

  insert into private.eixpay_audit_events(event_code,metadata)
  values ('ci_integrity_smoke',jsonb_build_object('test',true))
  returning id into v_audit_id;

  select last_sequence,last_hash into v_after,v_chain_hash
  from private.eixpay_integrity_chain_state where singleton=true;

  if v_after <> v_before + 2 then
    raise exception 'EIXPAY_INTEGRITY_SEQUENCE_DID_NOT_ADVANCE_TWICE';
  end if;

  select count(*) into v_event_count
  from private.eixpay_integrity_events
  where (source_table='eixpay_ledger' and source_id=v_ledger_id)
     or (source_table='eixpay_audit_events' and source_id=v_audit_id);
  if v_event_count <> 2 then
    raise exception 'EIXPAY_INTEGRITY_EVENTS_NOT_WRITTEN';
  end if;

  select to_jsonb(l) into v_payload
  from private.eixpay_ledger l where l.id=v_ledger_id;
  if not exists (
    select 1 from private.eixpay_integrity_events e
    where e.source_table='eixpay_ledger'
      and e.source_id=v_ledger_id
      and e.source_hash=encode(extensions.digest(convert_to(v_payload::text,'UTF8'),'sha256'),'hex')
  ) then
    raise exception 'EIXPAY_LEDGER_SOURCE_HASH_MISMATCH';
  end if;

  begin
    update private.eixpay_ledger set amount=2 where id=v_ledger_id;
    raise exception 'EIXPAY_LEDGER_MUTATION_WAS_NOT_BLOCKED';
  exception when sqlstate '55000' then
    null;
  end;

  begin
    update private.eixpay_audit_events set event_code='tampered' where id=v_audit_id;
    raise exception 'EIXPAY_AUDIT_MUTATION_WAS_NOT_BLOCKED';
  exception when sqlstate '55000' then
    null;
  end;
end;
$test$;

rollback;
