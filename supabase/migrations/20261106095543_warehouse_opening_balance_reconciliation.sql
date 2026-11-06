-- Audited, one-time opening stock reconciliation per product and warehouse.
begin;

create or replace function public.record_warehouse_opening_balance(
  p_warehouse_id uuid,
  p_product_id uuid,
  p_quantity integer,
  p_note text,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_warehouse public.warehouses%rowtype;
  v_product public.products%rowtype;
  v_inventory public.warehouse_inventory%rowtype;
  v_movement_id uuid;
begin
  if p_warehouse_id is null or p_product_id is null or p_actor_user_id is null then
    raise exception 'OPENING_BALANCE_REQUIRED_FIELDS_MISSING' using errcode = '22023';
  end if;
  if p_quantity is null or p_quantity < 0 or p_quantity > 1000000 then
    raise exception 'OPENING_BALANCE_QUANTITY_INVALID' using errcode = '22023';
  end if;
  if p_note is null or char_length(btrim(p_note)) < 5 or char_length(p_note) > 500 then
    raise exception 'OPENING_BALANCE_NOTE_REQUIRED' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_warehouse_id::text || ':' || p_product_id::text, 0));

  select * into v_warehouse from public.warehouses
  where id = p_warehouse_id and is_active = true for update;
  if not found then
    raise exception 'WAREHOUSE_NOT_FOUND_OR_INACTIVE' using errcode = 'P0002';
  end if;

  select * into v_product from public.products
  where id = p_product_id and is_active = true;
  if not found then
    raise exception 'PRODUCT_NOT_FOUND_OR_INACTIVE' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.warehouse_inventory
    where warehouse_id = p_warehouse_id and product_id = p_product_id
  ) then
    raise exception 'OPENING_BALANCE_ALREADY_RECORDED_USE_STOCK_ADJUSTMENT' using errcode = '23505';
  end if;

  insert into public.warehouse_inventory
    (warehouse_id, product_id, quantity_on_hand, quantity_reserved, reorder_level)
  values (p_warehouse_id, p_product_id, p_quantity, 0, 0)
  returning * into v_inventory;

  if p_quantity > 0 then
    insert into public.inventory_movements
      (product_id, from_warehouse_id, to_warehouse_id, quantity, movement_type,
       reference_type, reference_id, note, actor_user_id)
    values
      (p_product_id, null, p_warehouse_id, p_quantity, 'opening_balance',
       'warehouse_inventory', v_inventory.id, btrim(p_note), p_actor_user_id)
    returning id into v_movement_id;
  end if;

  return jsonb_build_object(
    'inventory_id', v_inventory.id,
    'warehouse_id', p_warehouse_id,
    'product_id', p_product_id,
    'quantity_on_hand', v_inventory.quantity_on_hand,
    'quantity_reserved', v_inventory.quantity_reserved,
    'movement_id', v_movement_id
  );
end;
$$;

revoke all on function public.record_warehouse_opening_balance(uuid, uuid, integer, text, uuid)
  from public, anon, authenticated;
grant execute on function public.record_warehouse_opening_balance(uuid, uuid, integer, text, uuid)
  to service_role;

comment on function public.record_warehouse_opening_balance(uuid, uuid, integer, text, uuid)
  is 'Records a one-time physical opening balance with a ledger entry; never copies legacy products.stock.';

commit;
