-- Prevent reopening terminal orders and prevent inventory being restored twice.
-- The order row lock serializes concurrent transitions; terminal states cannot be left.

-- The historical migration baseline used an enum with 'packing';
-- add/rename values in-place so triggers depending on orders.status remain intact.
-- Production already uses text, so this is a no-op on the live schema.
do $migration$
begin
  if pg_catalog.to_regtype('public.order_status') is not null then
    if exists (
      select 1 from pg_catalog.pg_enum e
      where e.enumtypid = pg_catalog.to_regtype('public.order_status')
        and e.enumlabel = 'packing'
    ) and not exists (
      select 1 from pg_catalog.pg_enum e
      where e.enumtypid = pg_catalog.to_regtype('public.order_status')
        and e.enumlabel = 'processing'
    ) then
      alter type public.order_status rename value 'packing' to 'processing';
    end if;

    alter type public.order_status add value if not exists 'processing';
    alter type public.order_status add value if not exists 'packed';
    alter type public.order_status add value if not exists 'returned';
  end if;
end;
$migration$;

-- The SMS trigger must compare/format status as text because historical
-- installations store orders.status as an enum while Production stores text.
create or replace function private.queue_customer_order_sms()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.customer_phone is null
     or pg_catalog.length(pg_catalog.btrim(new.customer_phone)) < 7 then
    return new;
  end if;

  if tg_op = 'INSERT' then
    insert into private.customer_notification_outbox(
      order_id, phone, event_type, event_key, message
    ) values (
      new.id, new.customer_phone, 'order_created', 'created',
      'NEWEIX: আপনার অর্ডার ' || new.order_number || ' গ্রহণ করা হয়েছে। মোট ৳' ||
      pg_catalog.round(new.total)::text || '। ধন্যবাদ।'
    )
    on conflict (order_id, event_type, event_key) do nothing;
    return new;
  end if;

  if new.status::text is distinct from old.status::text then
    insert into private.customer_notification_outbox(
      order_id, phone, event_type, event_key, message
    ) values (
      new.id, new.customer_phone, 'order_status', new.status::text,
      'NEWEIX: অর্ডার ' || new.order_number || ' এর নতুন অবস্থা: ' ||
      case new.status::text
        when 'confirmed' then 'নিশ্চিত হয়েছে'
        when 'processing' then 'প্রসেসিং হচ্ছে'
        when 'packed' then 'প্যাক করা হয়েছে'
        when 'shipped' then 'কুরিয়ারে পাঠানো হয়েছে'
        when 'delivered' then 'ডেলিভারি সম্পন্ন হয়েছে'
        when 'cancelled' then 'বাতিল হয়েছে'
        when 'returned' then 'ফেরত এসেছে'
        else new.status::text
      end || '।'
    )
    on conflict (order_id, event_type, event_key) do nothing;
  end if;

  if new.payment_status = 'paid'
     and old.payment_status is distinct from new.payment_status then
    insert into private.customer_notification_outbox(
      order_id, phone, event_type, event_key, message
    ) values (
      new.id, new.customer_phone, 'payment_confirmed', 'paid',
      'NEWEIX: অর্ডার ' || new.order_number || ' এর পেমেন্ট নিশ্চিত হয়েছে। ধন্যবাদ।'
    )
    on conflict (order_id, event_type, event_key) do nothing;
  end if;

  return new;
end;
$function$;

create or replace function public.admin_update_order_status(
  p_order_id uuid,
  p_new_status text,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_old_status text;
  v_delivery_status text;
  v_delivery_consignment_id text;
  v_transition_allowed boolean;
begin
  if p_order_id is null or p_actor_id is null then
    raise exception 'INVALID_INPUT';
  end if;

  if p_new_status is null or p_new_status not in (
    'pending', 'confirmed', 'processing', 'packed',
    'shipped', 'delivered', 'cancelled', 'returned'
  ) then
    raise exception 'INVALID_ORDER_STATUS';
  end if;

  if not exists (
    select 1
      from public.staff_profiles sp
     where sp.user_id = p_actor_id
       and sp.role in ('supreme', 'admin')
       and sp.is_active = true
  ) then
    raise exception 'ACTOR_NOT_AUTHORIZED';
  end if;

  select o.status, o.delivery_status, o.delivery_consignment_id
    into v_old_status, v_delivery_status, v_delivery_consignment_id
    from public.orders o
   where o.id = p_order_id
   for update;

  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;

  if v_old_status = p_new_status then
    return pg_catalog.jsonb_build_object(
      'order_id', p_order_id,
      'old_status', v_old_status,
      'new_status', p_new_status,
      'changed', false,
      'inventory_restocked', false
    );
  end if;

  -- Do not restock/cancel while a booking is in progress or a consignment
  -- remains linked. Pathao timeouts leave the state at 'booking'; a definite
  -- provider rejection is marked 'failed' and may be safely cancelled.
  if p_new_status = 'cancelled'
     and (
       v_delivery_status not in ('not_booked', 'failed')
       or v_delivery_consignment_id is not null
     ) then
    raise exception 'ORDER_DELIVERY_MUST_BE_CANCELLED_FIRST'
      using errcode = '55000';
  end if;

  -- Statuses move forward only. Shipped orders must complete delivery or
  -- enter the return workflow; terminal orders cannot be reopened.
  v_transition_allowed := case v_old_status
    when 'pending' then p_new_status in ('confirmed', 'processing', 'packed', 'cancelled')
    when 'confirmed' then p_new_status in ('processing', 'packed', 'cancelled')
    when 'processing' then p_new_status in ('packed', 'shipped', 'cancelled')
    when 'packed' then p_new_status in ('shipped', 'cancelled')
    when 'shipped' then p_new_status in ('delivered', 'returned')
    when 'delivered' then p_new_status = 'returned'
    else false
  end;

  if not coalesce(v_transition_allowed, false) then
    raise exception 'INVALID_ORDER_STATUS_TRANSITION'
      using errcode = '22023';
  end if;

  -- Cancellation and inventory restoration are one transaction. Since a
  -- cancelled order is terminal, this block can execute only once per order.
  if p_new_status = 'cancelled' then
    if exists (
      select 1
        from public.order_items oi
        left join public.products p on p.id = oi.product_id
       where oi.order_id = p_order_id
         and (oi.product_id is null or p.id is null)
    ) then
      raise exception 'ORDER_PRODUCT_REFERENCE_MISSING';
    end if;

    update public.products p
       set stock = p.stock + item_totals.quantity,
           updated_at = pg_catalog.now()
      from (
        select oi.product_id, pg_catalog.sum(oi.quantity)::integer as quantity
          from public.order_items oi
         where oi.order_id = p_order_id
         group by oi.product_id
      ) item_totals
     where p.id = item_totals.product_id;
  end if;

  -- The local baseline uses an enum; Production uses text. Cast only when
  -- the live column is enum-backed, after the enum migration above has committed.
  if pg_catalog.to_regtype('public.order_status') is not null
     and exists (
       select 1 from pg_catalog.pg_attribute a
       where a.attrelid = 'public.orders'::regclass
         and a.attname = 'status'
         and a.atttypid = pg_catalog.to_regtype('public.order_status')
         and not a.attisdropped
     ) then
    execute
      'update public.orders set status = $1::public.order_status, updated_at = pg_catalog.now() where id = $2'
      using p_new_status, p_order_id;
  else
    update public.orders
       set status = p_new_status,
           updated_at = pg_catalog.now()
     where id = p_order_id;
  end if;

  -- Production uses audit_logs.actor_id; the historical migration baseline
  -- used actor_user_id. Select the existing column without changing live data.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'audit_logs'
      and column_name = 'actor_id'
  ) then
    insert into public.audit_logs (
      actor_id, action, target_type, target_id, details
    ) values (
      p_actor_id,
      'admin_order_status_updated',
      'order',
      p_order_id::text,
      pg_catalog.jsonb_build_object(
        'old_status', v_old_status,
        'new_status', p_new_status,
        'inventory_restocked', p_new_status = 'cancelled'
      )
    );
  else
    insert into public.audit_logs (
      actor_user_id, action, target_type, target_id, details
    ) values (
      p_actor_id,
      'admin_order_status_updated',
      'order',
      p_order_id::text,
      pg_catalog.jsonb_build_object(
        'old_status', v_old_status,
        'new_status', p_new_status,
        'inventory_restocked', p_new_status = 'cancelled'
      )
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'order_id', p_order_id,
    'old_status', v_old_status,
    'new_status', p_new_status,
    'changed', true,
    'inventory_restocked', p_new_status = 'cancelled'
  );
end;
$function$;

revoke all on function public.admin_update_order_status(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.admin_update_order_status(uuid, text, uuid)
  to service_role;
