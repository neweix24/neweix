-- Automatically activate scheduled campaigns and close expired ones.
do $eixverse_campaign_cron$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id from cron.job
  where jobname='eixverse-campaign-lifecycle' limit 1;
  if v_job_id is not null then perform cron.unschedule(v_job_id); end if;
  perform cron.schedule(
    'eixverse-campaign-lifecycle',
    '* * * * *',
    $job$
      update private.eixverse_campaigns
      set status='active',updated_at=now()
      where status='scheduled' and starts_at<=now() and ends_at>now();
      update private.eixverse_campaigns
      set status='closed',updated_at=now()
      where status in ('scheduled','active','paused') and ends_at<=now();
    $job$
  );
end;
$eixverse_campaign_cron$;
