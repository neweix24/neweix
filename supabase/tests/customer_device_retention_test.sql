-- Disposable PostgreSQL regression test for the 180-day customer device retention policy.
begin;

do $test$
declare
  v_user_id uuid := gen_random_uuid();
  v_old_device_id uuid := gen_random_uuid();
  v_recent_device_id uuid := gen_random_uuid();
  v_old_log_id uuid := gen_random_uuid();
  v_recent_log_id uuid := gen_random_uuid();
  v_old_tracking_key text := pg_catalog.md5(gen_random_uuid()::text) || pg_catalog.md5(gen_random_uuid()::text);
  v_recent_tracking_key text := pg_catalog.md5(gen_random_uuid()::text) || pg_catalog.md5(gen_random_uuid()::text);
  v_old_order_key text := pg_catalog.md5(gen_random_uuid()::text) || pg_catalog.md5(gen_random_uuid()::text);
  v_recent_order_key text := pg_catalog.md5(gen_random_uuid()::text) || pg_catalog.md5(gen_random_uuid()::text);
  v_result jsonb;
begin
  insert into auth.users (
    id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    is_sso_user, is_anonymous
  ) values (
    v_user_id, 'authenticated', 'authenticated',
    'device-retention-test-' || v_user_id::text || '@example.invalid',
    '', pg_catalog.now(), pg_catalog.now(), pg_catalog.now(), false, false
  );

  insert into public.customer_devices (
    id, user_id, device_id, last_seen_at
  ) values
    (v_old_device_id, v_user_id, gen_random_uuid(), pg_catalog.now() - interval '181 days'),
    (v_recent_device_id, v_user_id, gen_random_uuid(), pg_catalog.now() - interval '179 days');

  insert into public.customer_device_access_logs (
    id, user_id, device_id, ip_address, accessed_at
  ) values
    (v_old_log_id, v_user_id, v_old_device_id, '192.0.2.10', pg_catalog.now() - interval '181 days'),
    (v_recent_log_id, v_user_id, v_recent_device_id, '192.0.2.11', pg_catalog.now() - interval '179 days');

  insert into private.order_tracking_rate_limits (
    client_key, window_started_at, request_count, updated_at
  ) values
    (v_old_tracking_key, pg_catalog.now() - interval '2 days', 1, pg_catalog.now() - interval '2 days'),
    (v_recent_tracking_key, pg_catalog.now() - interval '12 hours', 1, pg_catalog.now() - interval '12 hours');

  insert into private.order_creation_rate_limits (
    ip_hash, window_started_at, request_count, updated_at
  ) values
    (v_old_order_key, pg_catalog.now() - interval '2 days', 1, pg_catalog.now() - interval '2 days'),
    (v_recent_order_key, pg_catalog.now() - interval '12 hours', 1, pg_catalog.now() - interval '12 hours');

  v_result := private.cleanup_customer_device_data();

  if exists (select 1 from public.customer_device_access_logs where id = v_old_log_id)
     or exists (select 1 from public.customer_devices where id = v_old_device_id) then
    raise exception 'EXPIRED_CUSTOMER_DEVICE_DATA_WAS_NOT_DELETED';
  end if;

  if not exists (select 1 from public.customer_device_access_logs where id = v_recent_log_id)
     or not exists (select 1 from public.customer_devices where id = v_recent_device_id) then
    raise exception 'RECENT_CUSTOMER_DEVICE_DATA_WAS_DELETED_EARLY';
  end if;

  if (v_result->>'retention_days')::integer <> 180 then
    raise exception 'CUSTOMER_DEVICE_RETENTION_PERIOD_MISMATCH';
  end if;

  if exists (select 1 from private.order_tracking_rate_limits where client_key = v_old_tracking_key)
     or exists (select 1 from private.order_creation_rate_limits where ip_hash = v_old_order_key) then
    raise exception 'EXPIRED_RATE_LIMIT_KEYS_WERE_NOT_DELETED';
  end if;

  if not exists (select 1 from private.order_tracking_rate_limits where client_key = v_recent_tracking_key)
     or not exists (select 1 from private.order_creation_rate_limits where ip_hash = v_recent_order_key) then
    raise exception 'RECENT_RATE_LIMIT_KEYS_WERE_DELETED_EARLY';
  end if;

  if (v_result->>'rate_limit_retention_days')::integer <> 1 then
    raise exception 'RATE_LIMIT_RETENTION_PERIOD_MISMATCH';
  end if;

  if has_function_privilege('anon', 'private.cleanup_customer_device_data()', 'EXECUTE')
     or has_function_privilege('authenticated', 'private.cleanup_customer_device_data()', 'EXECUTE') then
    raise exception 'CUSTOMER_DEVICE_CLEANUP_EXPOSED_TO_CLIENT_ROLES';
  end if;

  if not exists (
    select 1 from cron.job where jobname = 'neweix-customer-device-retention'
  ) then
    raise exception 'CUSTOMER_DEVICE_RETENTION_CRON_NOT_SCHEDULED';
  end if;
end;
$test$;

rollback;
