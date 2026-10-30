-- NEWEIX backend hardening: restore inventory exactly once on admin cancellation.
-- Apply through Supabase migrations; live project has this migration applied.

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

  select status
    into v_old_status
    from public.orders
   where id = p_order_id
   for update;

  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;

  -- Never restock an order that has already left the warehouse.
  -- A returned shipment must be inspected and restocked through a separate
  -- receiving workflow, not by changing its status to cancelled.
  if p_new_status = 'cancelled'
     and v_old_status in ('shipped', 'delivered', 'returned') then
    raise exception 'ORDER_CANNOT_BE_CANCELLED';
  end if;

  if v_old_status = p_new_status then
    return pg_catalog.jsonb_build_object(
      'order_id', p_order_id,
      'old_status', v_old_status,
      'new_status', p_new_status,
      'changed', false
    );
  end if;

  -- Restock cancelled orders in the same transaction as the status change.
  -- The row lock and old-status guard ensure this runs only once.
  if p_new_status = 'cancelled' and v_old_status <> 'cancelled' then
    update public.products p
       set stock = p.stock + oi.quantity
      from public.order_items oi
     where oi.order_id = p_order_id
       and oi.product_id = p.id;
  end if;

  update public.orders
     set status = p_new_status,
         updated_at = pg_catalog.now()
   where id = p_order_id;

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

-- Keep expiry safe and observable; expired mobile orders return stock and update timestamps.
create or replace function public.expire_unpaid_mobile_orders()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_order record;
  v_count integer := 0;
begin
  for v_order in
    select id
      from public.orders
     where payment_method <> 'cod'
       and payment_status in ('pending', 'verification_pending')
       and status = 'pending'
       and created_at < pg_catalog.now() - interval '24 hours'
     for update skip locked
  loop
    update public.products p
       set stock = p.stock + oi.quantity
      from public.order_items oi
     where oi.order_id = v_order.id
       and oi.product_id = p.id;

    update public.orders
       set status = 'cancelled',
           payment_status = 'failed',
           updated_at = pg_catalog.now()
     where id = v_order.id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$function$;

revoke all on function public.expire_unpaid_mobile_orders()
  from public, anon, authenticated;
grant execute on function public.expire_unpaid_mobile_orders()
  to service_role;
