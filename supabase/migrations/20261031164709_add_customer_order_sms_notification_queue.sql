create table if not exists private.customer_notification_outbox (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  phone text not null,
  event_type text not null check (event_type in ('order_created','order_status','payment_confirmed')),
  event_key text not null,
  message text not null,
  status text not null default 'queued' check (status in ('queued','sending','sent','failed')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique(order_id,event_type,event_key)
);
create index if not exists customer_notification_outbox_due_idx
  on private.customer_notification_outbox(status,next_attempt_at,created_at);
alter table private.customer_notification_outbox enable row level security;
revoke all on private.customer_notification_outbox from public,anon,authenticated;
grant all on private.customer_notification_outbox to service_role;

create or replace function private.queue_customer_order_sms()
returns trigger language plpgsql security definer set search_path = ''
as $function$
begin
  if new.customer_phone is null or pg_catalog.length(pg_catalog.btrim(new.customer_phone)) < 7 then return new; end if;
  if tg_op = 'INSERT' then
    insert into private.customer_notification_outbox(order_id,phone,event_type,event_key,message)
    values(new.id,new.customer_phone,'order_created','created',
      'NEWEIX: আপনার অর্ডার ' || new.order_number || ' গ্রহণ করা হয়েছে। মোট ৳' ||
      pg_catalog.round(new.total)::text || '। ধন্যবাদ।')
    on conflict (order_id,event_type,event_key) do nothing;
    return new;
  end if;
  if new.status is distinct from old.status then
    insert into private.customer_notification_outbox(order_id,phone,event_type,event_key,message)
    values(new.id,new.customer_phone,'order_status',new.status,
      'NEWEIX: অর্ডার ' || new.order_number || ' এর নতুন অবস্থা: ' ||
      case new.status
        when 'confirmed' then 'নিশ্চিত হয়েছে'
        when 'processing' then 'প্রসেসিং হচ্ছে'
        when 'packed' then 'প্যাক করা হয়েছে'
        when 'shipped' then 'কুরিয়ারে পাঠানো হয়েছে'
        when 'delivered' then 'ডেলিভারি সম্পন্ন হয়েছে'
        when 'cancelled' then 'বাতিল হয়েছে'
        when 'returned' then 'ফেরত এসেছে'
        else new.status
      end || '।')
    on conflict (order_id,event_type,event_key) do nothing;
  end if;
  if new.payment_status='paid' and old.payment_status is distinct from new.payment_status then
    insert into private.customer_notification_outbox(order_id,phone,event_type,event_key,message)
    values(new.id,new.customer_phone,'payment_confirmed','paid',
      'NEWEIX: অর্ডার ' || new.order_number || ' এর পেমেন্ট নিশ্চিত হয়েছে। ধন্যবাদ।')
    on conflict (order_id,event_type,event_key) do nothing;
  end if;
  return new;
end;
$function$;

drop trigger if exists orders_queue_customer_sms on public.orders;
create trigger orders_queue_customer_sms
after insert or update of status,payment_status on public.orders
for each row execute function private.queue_customer_order_sms();

create or replace function public.neweix_claim_customer_notifications(p_limit integer default 10)
returns table(id uuid,phone text,message text,attempts integer)
language plpgsql security definer set search_path = ''
as $function$
begin
  if p_limit < 1 or p_limit > 25 then raise exception 'INVALID_BATCH_SIZE'; end if;
  return query
  with due as (
    select q.id from private.customer_notification_outbox q
    where q.status='queued' and q.next_attempt_at <= pg_catalog.now()
    order by q.created_at for update skip locked limit p_limit
  )
  update private.customer_notification_outbox q
     set status='sending',attempts=q.attempts+1
    from due where q.id=due.id
  returning q.id,q.phone,q.message,q.attempts;
end;
$function$;

create or replace function public.neweix_complete_customer_notification(p_id uuid)
returns void language sql security definer set search_path = ''
as $function$
  update private.customer_notification_outbox
     set status='sent',sent_at=pg_catalog.now(),last_error=null
   where id=p_id and status='sending';
$function$;

create or replace function public.neweix_fail_customer_notification(p_id uuid,p_error text)
returns void language sql security definer set search_path = ''
as $function$
  update private.customer_notification_outbox
     set status=case when attempts >= 5 then 'failed' else 'queued' end,
         next_attempt_at=pg_catalog.now() + (interval '5 minutes' * greatest(attempts,1)),
         last_error=left(coalesce(p_error,'SMS delivery failed'),500)
   where id=p_id and status='sending';
$function$;

revoke all on function public.neweix_claim_customer_notifications(integer) from public,anon,authenticated;
revoke all on function public.neweix_complete_customer_notification(uuid) from public,anon,authenticated;
revoke all on function public.neweix_fail_customer_notification(uuid,text) from public,anon,authenticated;
grant execute on function public.neweix_claim_customer_notifications(integer) to service_role;
grant execute on function public.neweix_complete_customer_notification(uuid) to service_role;
grant execute on function public.neweix_fail_customer_notification(uuid,text) to service_role;
