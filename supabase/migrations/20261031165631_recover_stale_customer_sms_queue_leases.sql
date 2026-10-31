alter table private.customer_notification_outbox
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.neweix_claim_customer_notifications(p_limit integer default 10)
returns table(id uuid,phone text,message text,attempts integer)
language plpgsql security definer set search_path = ''
as $function$
begin
  if p_limit < 1 or p_limit > 25 then raise exception 'INVALID_BATCH_SIZE'; end if;
  return query
  with due as (
    select q.id from private.customer_notification_outbox q
    where (q.status='queued' and q.next_attempt_at <= pg_catalog.now())
       or (q.status='sending' and q.updated_at <= pg_catalog.now() - interval '15 minutes')
    order by q.created_at for update skip locked limit p_limit
  )
  update private.customer_notification_outbox q
     set status='sending',attempts=q.attempts+1,updated_at=pg_catalog.now()
    from due where q.id=due.id
  returning q.id,q.phone,q.message,q.attempts;
end;
$function$;

create or replace function public.neweix_complete_customer_notification(p_id uuid)
returns void language sql security definer set search_path = ''
as $function$
  update private.customer_notification_outbox
     set status='sent',sent_at=pg_catalog.now(),last_error=null,updated_at=pg_catalog.now()
   where id=p_id and status='sending';
$function$;

create or replace function public.neweix_fail_customer_notification(p_id uuid,p_error text)
returns void language sql security definer set search_path = ''
as $function$
  update private.customer_notification_outbox
     set status=case when attempts >= 5 then 'failed' else 'queued' end,
         next_attempt_at=pg_catalog.now() + (interval '5 minutes' * greatest(attempts,1)),
         last_error=left(coalesce(p_error,'SMS delivery failed'),500),
         updated_at=pg_catalog.now()
   where id=p_id and status='sending';
$function$;

revoke all on function public.neweix_claim_customer_notifications(integer) from public,anon,authenticated;
revoke all on function public.neweix_complete_customer_notification(uuid) from public,anon,authenticated;
revoke all on function public.neweix_fail_customer_notification(uuid,text) from public,anon,authenticated;
grant execute on function public.neweix_claim_customer_notifications(integer) to service_role;
grant execute on function public.neweix_complete_customer_notification(uuid) to service_role;
grant execute on function public.neweix_fail_customer_notification(uuid,text) to service_role;
