-- Retain customer device and access-log metadata for 180 days.
-- The scheduled cleanup deletes expired access logs first, then stale device records.

create index if not exists customer_device_access_logs_accessed_at_idx
  on public.customer_device_access_logs (accessed_at);

create index if not exists customer_devices_last_seen_at_idx
  on public.customer_devices (last_seen_at);

create or replace function private.cleanup_customer_device_data()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_logs_deleted bigint := 0;
  v_devices_deleted bigint := 0;
  v_cutoff timestamptz := pg_catalog.now() - interval '180 days';
begin
  delete from public.customer_device_access_logs
   where accessed_at < v_cutoff;
  get diagnostics v_logs_deleted = row_count;

  delete from public.customer_devices
   where last_seen_at < v_cutoff;
  get diagnostics v_devices_deleted = row_count;

  return pg_catalog.jsonb_build_object(
    'retention_days', 180,
    'cutoff', v_cutoff,
    'access_logs_deleted', v_logs_deleted,
    'devices_deleted', v_devices_deleted
  );
end;
$function$;

revoke all on function private.cleanup_customer_device_data()
  from public, anon, authenticated;
grant execute on function private.cleanup_customer_device_data()
  to service_role;

do $schedule$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id
    from cron.job
   where jobname = 'neweix-customer-device-retention';

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  perform cron.schedule(
    'neweix-customer-device-retention',
    '17 3 * * *',
    'select private.cleanup_customer_device_data();'
  );
end;
$schedule$;
