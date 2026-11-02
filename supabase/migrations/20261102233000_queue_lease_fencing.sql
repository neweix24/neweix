-- Fence queue workers with a per-claim token. A worker whose lease expired
-- cannot complete/fail a job after another worker has reclaimed it.
begin;

alter table private.customer_notification_outbox
  add column if not exists lease_token uuid;
alter table private.product_search_embedding_jobs
  add column if not exists lease_token uuid;

drop function if exists public.neweix_claim_customer_notifications(integer);
drop function if exists public.neweix_complete_customer_notification(uuid);
drop function if exists public.neweix_fail_customer_notification(uuid, text);

create function public.neweix_claim_customer_notifications(p_limit integer default 10)
returns table(id uuid, phone text, message text, attempts integer, lease_token uuid)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role') is distinct from 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 25 then
    raise exception 'INVALID_BATCH_SIZE';
  end if;

  return query
  with due as (
    select q.id
      from private.customer_notification_outbox q
     where q.attempts < 5
       and (
         (q.status = 'queued' and q.next_attempt_at <= pg_catalog.now())
         or (q.status = 'sending' and q.updated_at <= pg_catalog.now() - interval '15 minutes')
       )
     order by q.created_at
     for update skip locked
     limit p_limit
  )
  update private.customer_notification_outbox q
     set status = 'sending',
         attempts = q.attempts + 1,
         lease_token = pg_catalog.gen_random_uuid(),
         updated_at = pg_catalog.now()
    from due
   where q.id = due.id
  returning q.id, q.phone, q.message, q.attempts, q.lease_token;
end;
$function$;

create function public.neweix_complete_customer_notification(p_id uuid, p_lease_token uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare affected integer;
begin
  if coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role') is distinct from 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  update private.customer_notification_outbox
     set status = 'sent', sent_at = pg_catalog.now(), last_error = null,
         lease_token = null, updated_at = pg_catalog.now()
   where id = p_id and status = 'sending' and lease_token = p_lease_token;
  get diagnostics affected = row_count;
  return affected = 1;
end;
$function$;

create function public.neweix_fail_customer_notification(p_id uuid, p_lease_token uuid, p_error text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare affected integer;
begin
  if coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role') is distinct from 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  update private.customer_notification_outbox
     set status = case when attempts >= 5 then 'failed' else 'queued' end,
         next_attempt_at = pg_catalog.now() + make_interval(secs => least(3600, greatest(attempts, 1) * 300)),
         last_error = left(coalesce(p_error, 'SMS delivery failed'), 500),
         lease_token = null, updated_at = pg_catalog.now()
   where id = p_id and status = 'sending' and lease_token = p_lease_token;
  get diagnostics affected = row_count;
  return affected = 1;
end;
$function$;

drop function if exists public.neweix_claim_search_embedding_jobs(integer);
drop function if exists public.neweix_complete_search_embedding_job(uuid);
drop function if exists public.neweix_fail_search_embedding_job(uuid, text);

create function public.neweix_claim_search_embedding_jobs(p_limit integer default 10)
returns table(job_id uuid, product_id uuid, attempts integer, lease_token uuid)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role') is distinct from 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  return query
  with picked as (
    select j.id
      from private.product_search_embedding_jobs j
     where j.attempts < 8
       and j.available_at <= pg_catalog.now()
       and (j.status = 'pending' or (j.status = 'processing' and j.locked_until < pg_catalog.now()))
     order by j.created_at
     for update skip locked
     limit least(greatest(coalesce(p_limit, 10), 1), 25)
  ),
  claimed as (
    update private.product_search_embedding_jobs j
       set status = 'processing',
           attempts = j.attempts + 1,
           lease_token = pg_catalog.gen_random_uuid(),
           locked_until = pg_catalog.now() + interval '3 minutes',
           updated_at = pg_catalog.now()
      from picked
     where j.id = picked.id
    returning j.id, j.product_id, j.attempts, j.lease_token
  )
  select claimed.id, claimed.product_id, claimed.attempts, claimed.lease_token
    from claimed;
end;
$function$;

create function public.neweix_complete_search_embedding_job(p_job_id uuid, p_lease_token uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare affected integer;
begin
  if coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role') is distinct from 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  delete from private.product_search_embedding_jobs
   where id = p_job_id and lease_token = p_lease_token;
  get diagnostics affected = row_count;
  return affected = 1;
end;
$function$;

create function public.neweix_fail_search_embedding_job(p_job_id uuid, p_lease_token uuid, p_error text default 'Embedding generation failed')
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare affected integer;
begin
  if coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role') is distinct from 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  update private.product_search_embedding_jobs
     set status = case when attempts >= 8 then 'failed' else 'pending' end,
         available_at = pg_catalog.now() + make_interval(secs => least(3600, (power(2, greatest(attempts, 1))::integer) * 15)),
         locked_until = null, lease_token = null,
         last_error = left(coalesce(p_error, 'Embedding generation failed'), 500),
         updated_at = pg_catalog.now()
   where id = p_job_id and lease_token = p_lease_token;
  get diagnostics affected = row_count;
  return affected = 1;
end;
$function$;

revoke all on function public.neweix_claim_customer_notifications(integer) from public, anon, authenticated;
revoke all on function public.neweix_complete_customer_notification(uuid, uuid) from public, anon, authenticated;
revoke all on function public.neweix_fail_customer_notification(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.neweix_claim_search_embedding_jobs(integer) from public, anon, authenticated;
revoke all on function public.neweix_complete_search_embedding_job(uuid, uuid) from public, anon, authenticated;
revoke all on function public.neweix_fail_search_embedding_job(uuid, uuid, text) from public, anon, authenticated;

grant execute on function public.neweix_claim_customer_notifications(integer) to service_role;
grant execute on function public.neweix_complete_customer_notification(uuid, uuid) to service_role;
grant execute on function public.neweix_fail_customer_notification(uuid, uuid, text) to service_role;
grant execute on function public.neweix_claim_search_embedding_jobs(integer) to service_role;
grant execute on function public.neweix_complete_search_embedding_job(uuid, uuid) to service_role;
grant execute on function public.neweix_fail_search_embedding_job(uuid, uuid, text) to service_role;

commit;
