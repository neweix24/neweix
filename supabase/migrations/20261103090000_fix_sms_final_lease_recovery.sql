-- Repair the final-attempt SMS lease recovery RPC in Production.
-- Qualify the table columns because attempts is also an OUT parameter.
create or replace function public.neweix_claim_customer_notifications_v2(p_limit integer default 10)
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

  update private.customer_notification_outbox as q
     set status = 'failed',
         lease_token = null,
         last_error = coalesce(q.last_error, 'SMS worker lease expired after final attempt'),
         updated_at = pg_catalog.now()
   where q.status = 'sending'
     and q.attempts >= 5
     and q.updated_at <= pg_catalog.now() - interval '15 minutes';

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
