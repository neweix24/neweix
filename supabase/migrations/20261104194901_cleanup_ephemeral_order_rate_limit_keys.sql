-- Purge ephemeral IP-based rate-limit keys; these counters are only needed for short windows.
create index if not exists order_tracking_rate_limits_updated_at_idx
  on private.order_tracking_rate_limits (updated_at);

create or replace function private.cleanup_customer_device_data()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_logs_deleted bigint := 0;
  v_devices_deleted bigint := 0;
  v_tracking_limits_deleted bigint := 0;
  v_order_limits_deleted bigint := 0;
  v_cutoff timestamptz := pg_catalog.now() - interval '180 days';
  v_rate_limit_cutoff timestamptz := pg_catalog.now() - interval '1 day';
begin
  delete from public.customer_device_access_logs
   where accessed_at < v_cutoff;
  get diagnostics v_logs_deleted = row_count;

  delete from public.customer_devices
   where last_seen_at < v_cutoff;
  get diagnostics v_devices_deleted = row_count;

  delete from private.order_tracking_rate_limits
   where updated_at < v_rate_limit_cutoff;
  get diagnostics v_tracking_limits_deleted = row_count;

  delete from private.order_creation_rate_limits
   where updated_at < v_rate_limit_cutoff;
  get diagnostics v_order_limits_deleted = row_count;

  return pg_catalog.jsonb_build_object(
    'retention_days', 180,
    'rate_limit_retention_days', 1,
    'cutoff', v_cutoff,
    'access_logs_deleted', v_logs_deleted,
    'devices_deleted', v_devices_deleted,
    'rate_limit_rows_deleted', v_tracking_limits_deleted + v_order_limits_deleted
  );
end;
$function$;

revoke all on function private.cleanup_customer_device_data()
  from public, anon, authenticated;
grant execute on function private.cleanup_customer_device_data()
  to service_role;
