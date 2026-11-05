-- Atomic warehouse allocation for confirmed orders.
-- All stock reservation, shipment grouping, fulfillment item creation, and ledger
-- entries commit or roll back together. This is intentionally not wired into
-- checkout until physical stock reconciliation and Pathao origin setup are complete.
begin;

create or replace function public.allocate_order_to_warehouses(
  p_order_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_order_status text;
  v_item record;
  v_stock record;
  v_remaining integer;
  v_take integer;
  v_fulfillment_id uuid;
  v_existing_fulfillment_id uuid;
  v_fulfillment_ids jsonb := '{}'::jsonb;
  v_shipments jsonb;
  v_total_allocated integer := 0;
begin
  if p_order_id is null or p_actor_user_id is null then
    raise exception 'WAREHOUSE_ALLOCATION_REQUIRED_FIELDS_MISSING' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.staff_profiles sp
    where sp.user_id = p_actor_user_id
      and sp.role in ('supreme', 'admin')
      and sp.is_active = true
  ) then
    raise exception 'WAREHOUSE_ALLOCATION_ACTOR_NOT_AUTHORIZED' using errcode = '42501';
  end if;

  select o.status::text
    into v_order_status
    from public.orders o
   where o.id = p_order_id
   for update;
  if not found then
    raise exception 'WAREHOUSE_ALLOCATION_ORDER_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_order_status not in ('confirmed', 'processing', 'packed') then
    raise exception 'WAREHOUSE_ALLOCATION_ORDER_NOT_READY' using errcode = '55000';
  end if;

  if exists (
    select 1 from public.order_fulfillments f where f.order_id = p_order_id
  ) then
    raise exception 'WAREHOUSE_ALLOCATION_ALREADY_EXISTS' using errcode = '23505';
  end if;

  if exists (
    select 1 from public.orders o
    where o.id = p_order_id
      and (
        o.delivery_consignment_id is not null
        or coalesce(o.delivery_status, 'not_booked') not in ('not_booked', 'failed')
      )
  ) then
    raise exception 'WAREHOUSE_ALLOCATION_PATHAO_ALREADY_BOOKED' using errcode = '55000';
  end if;

  if not exists (select 1 from public.order_items oi where oi.order_id = p_order_id) then
    raise exception 'WAREHOUSE_ALLOCATION_ORDER_HAS_NO_ITEMS' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.order_items oi
    where oi.order_id = p_order_id and oi.product_id is null
  ) then
    raise exception 'WAREHOUSE_ALLOCATION_PRODUCT_REFERENCE_MISSING' using errcode = '22023';
  end if;

  for v_item in
    select oi.id, oi.product_id, oi.product_name_snapshot, oi.unit_price, oi.quantity
      from public.order_items oi
     where oi.order_id = p_order_id
     order by oi.product_id, oi.id
  loop
    v_remaining := v_item.quantity;

    for v_stock in
      select wi.id, wi.warehouse_id,
             (wi.quantity_on_hand - wi.quantity_reserved)::integer as available_units,
             w.code as warehouse_code
        from public.warehouse_inventory wi
        join public.warehouses w on w.id = wi.warehouse_id
       where wi.product_id = v_item.product_id
         and w.is_active = true
         and wi.quantity_on_hand > wi.quantity_reserved
       order by w.is_primary desc,
                (wi.quantity_on_hand - wi.quantity_reserved) desc,
                w.code asc
       for update of wi
    loop
      exit when v_remaining = 0;
      v_take := least(v_remaining, v_stock.available_units);
      if v_take <= 0 then continue; end if;

      v_fulfillment_id := nullif(v_fulfillment_ids ->> v_stock.warehouse_id::text, '')::uuid;
      if v_fulfillment_id is null then
        insert into public.order_fulfillments (
          order_id, warehouse_id, fulfillment_number, status
        ) values (
          p_order_id,
          v_stock.warehouse_id,
          'NE-' || upper(substr(replace(pg_catalog.gen_random_uuid()::text, '-', ''), 1, 12)),
          'allocated'
        )
        returning id into v_fulfillment_id;

        v_fulfillment_ids := v_fulfillment_ids ||
          pg_catalog.jsonb_build_object(v_stock.warehouse_id::text, v_fulfillment_id::text);
      end if;

      update public.warehouse_inventory
         set quantity_reserved = quantity_reserved + v_take,
             updated_at = pg_catalog.now()
       where id = v_stock.id
         and quantity_on_hand - quantity_reserved >= v_take;
      if not found then
        raise exception 'WAREHOUSE_ALLOCATION_STOCK_CHANGED_RETRY' using errcode = '40001';
      end if;

      insert into public.order_fulfillment_items (
        fulfillment_id, order_item_id, product_id,
        product_name_snapshot, quantity, unit_price
      ) values (
        v_fulfillment_id, v_item.id, v_item.product_id,
        v_item.product_name_snapshot, v_take, v_item.unit_price
      );

      insert into public.inventory_movements (
        product_id, from_warehouse_id, to_warehouse_id, quantity,
        movement_type, reference_type, reference_id, note, actor_user_id
      ) values (
        v_item.product_id, null, v_stock.warehouse_id, v_take,
        'order_reservation', 'order_fulfillment', v_fulfillment_id,
        'Reserved for order ' || p_order_id::text, p_actor_user_id
      );

      v_remaining := v_remaining - v_take;
      v_total_allocated := v_total_allocated + v_take;
    end loop;

    if v_remaining > 0 then
      raise exception 'WAREHOUSE_ALLOCATION_INSUFFICIENT_STOCK'
        using errcode = '23514',
              detail = 'Insufficient reconciled warehouse stock for product ' || v_item.product_id::text;
    end if;
  end loop;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'fulfillment_id', f.id,
        'fulfillment_number', f.fulfillment_number,
        'warehouse_id', f.warehouse_id,
        'warehouse_code', w.code,
        'warehouse_name', w.name,
        'status', f.status,
        'items', (
          select coalesce(pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'order_item_id', fi.order_item_id,
              'product_id', fi.product_id,
              'product_name', fi.product_name_snapshot,
              'quantity', fi.quantity
            ) order by fi.created_at
          ), '[]'::jsonb)
          from public.order_fulfillment_items fi
          where fi.fulfillment_id = f.id
        )
      ) order by w.is_primary desc, w.code
    ), '[]'::jsonb
  )
  into v_shipments
  from public.order_fulfillments f
  join public.warehouses w on w.id = f.warehouse_id
  where f.order_id = p_order_id;

  return pg_catalog.jsonb_build_object(
    'order_id', p_order_id,
    'allocated', true,
    'total_units_reserved', v_total_allocated,
    'shipment_count', pg_catalog.jsonb_array_length(v_shipments),
    'shipments', v_shipments
  );
end;
$function$;

revoke all on function public.allocate_order_to_warehouses(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.allocate_order_to_warehouses(uuid, uuid)
  to service_role;

comment on function public.allocate_order_to_warehouses(uuid, uuid)
  is 'Atomically allocates confirmed order lines across active warehouses, reserves physical stock, creates split fulfillment groups, and records stock ledger movements.';

commit;
