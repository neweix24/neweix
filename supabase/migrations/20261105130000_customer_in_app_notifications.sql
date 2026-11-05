-- In-app customer notifications for order, payment and delivery events.
begin;

create table if not exists public.customer_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  event_type text not null check (event_type in ('order_created','order_status','payment_status','delivery_status')),
  event_key text not null,
  title text not null check (char_length(title) between 1 and 120),
  body text not null check (char_length(body) between 1 and 500),
  href text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint customer_notifications_order_event_unique unique(order_id,event_type,event_key)
);

create index if not exists customer_notifications_user_created_idx
  on public.customer_notifications(user_id,created_at desc,id desc);
create index if not exists customer_notifications_user_unread_idx
  on public.customer_notifications(user_id,created_at desc)
  where read_at is null;

alter table public.customer_notifications enable row level security;
revoke all on public.customer_notifications from public,anon;
grant select on public.customer_notifications to authenticated;
grant update(read_at) on public.customer_notifications to authenticated;

drop policy if exists customer_notifications_select_own on public.customer_notifications;
create policy customer_notifications_select_own
  on public.customer_notifications for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists customer_notifications_update_own on public.customer_notifications;
create policy customer_notifications_update_own
  on public.customer_notifications for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Only trusted database order writes can create notification rows. Customers
-- cannot insert or delete notifications through the Data API.
create or replace function private.create_customer_in_app_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_title text;
  v_body text;
  v_event_key text;
begin
  if new.customer_id is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    insert into public.customer_notifications(
      user_id,order_id,event_type,event_key,title,body,href
    ) values (
      new.customer_id,new.id,'order_created','created',
      'Order received',
      'Your order ' || new.order_number || ' has been received. We will keep you updated here.',
      '/orders/' || new.id::text
    )
    on conflict (order_id,event_type,event_key) do nothing;
    return new;
  end if;

  if new.status::text is distinct from old.status::text then
    v_title := case new.status::text
      when 'confirmed' then 'Order confirmed'
      when 'processing' then 'Order processing'
      when 'packed' then 'Order packed'
      when 'shipped' then 'Order shipped'
      when 'delivered' then 'Order delivered'
      when 'cancelled' then 'Order cancelled'
      when 'returned' then 'Order returned'
      else 'Order status updated'
    end;
    v_body := 'Order ' || new.order_number || ': ' || replace(new.status::text,'_',' ') || '.';
    v_event_key := 'status:' || new.status::text;
    insert into public.customer_notifications(
      user_id,order_id,event_type,event_key,title,body,href
    ) values (
      new.customer_id,new.id,'order_status',v_event_key,v_title,v_body,
      '/orders/' || new.id::text
    )
    on conflict (order_id,event_type,event_key) do nothing;
  end if;

  if new.payment_status::text is distinct from old.payment_status::text
     and new.payment_status::text <> 'pending' then
    v_title := case new.payment_status::text
      when 'paid' then 'Payment confirmed'
      when 'verification_pending' then 'Payment verification pending'
      when 'failed' then 'Payment failed'
      when 'refunded' then 'Payment refunded'
      else 'Payment status updated'
    end;
    v_body := 'Payment for order ' || new.order_number || ': ' ||
      replace(new.payment_status::text,'_',' ') || '.';
    v_event_key := 'payment:' || new.payment_status::text;
    insert into public.customer_notifications(
      user_id,order_id,event_type,event_key,title,body,href
    ) values (
      new.customer_id,new.id,'payment_status',v_event_key,v_title,v_body,
      '/orders/' || new.id::text
    )
    on conflict (order_id,event_type,event_key) do nothing;
  end if;

  if new.delivery_status::text is distinct from old.delivery_status::text
     and new.delivery_status::text <> 'not_booked' then
    v_title := case new.delivery_status::text
      when 'pending_approval' then 'Delivery awaiting approval'
      when 'booking' then 'Delivery booking in progress'
      when 'booked' then 'Delivery booked'
      when 'picked_up' then 'Parcel picked up'
      when 'in_transit' then 'Parcel in transit'
      when 'delivered' then 'Delivery completed'
      when 'returned' then 'Delivery returned'
      when 'cancelled' then 'Delivery cancelled'
      when 'failed' then 'Delivery update'
      else 'Delivery status updated'
    end;
    v_body := 'Delivery for order ' || new.order_number || ': ' ||
      replace(new.delivery_status::text,'_',' ') || '.';
    v_event_key := 'delivery:' || new.delivery_status::text;
    insert into public.customer_notifications(
      user_id,order_id,event_type,event_key,title,body,href
    ) values (
      new.customer_id,new.id,'delivery_status',v_event_key,v_title,v_body,
      '/orders/' || new.id::text
    )
    on conflict (order_id,event_type,event_key) do nothing;
  end if;

  return new;
end;
$function$;

revoke all on function private.create_customer_in_app_notifications() from public,anon,authenticated;

drop trigger if exists orders_create_customer_in_app_notifications on public.orders;
create trigger orders_create_customer_in_app_notifications
after insert or update of status,payment_status,delivery_status on public.orders
for each row execute function private.create_customer_in_app_notifications();

commit;
