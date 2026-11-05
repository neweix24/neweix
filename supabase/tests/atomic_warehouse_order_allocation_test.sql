-- Disposable behavior test for atomic split allocation across warehouses.
-- All fixture data and stock reservations are rolled back.

begin;

do $test$
declare
  v_actor_id uuid := pg_catalog.gen_random_uuid();
  v_product_a uuid;
  v_product_b uuid;
  v_order_id uuid := pg_catalog.gen_random_uuid();
  v_short_order_id uuid := pg_catalog.gen_random_uuid();
  v_mymensingh_id uuid;
  v_dhaka_id uuid;
  v_result jsonb;
  v_reserved integer;
  v_fulfillments integer;
  v_fulfillment_items integer;
  v_movement_count integer;
begin
  select id into v_mymensingh_id from public.warehouses where code = 'MYMENSINGH-HQ';
  select id into v_dhaka_id from public.warehouses where code = 'DHAKA-DC';
  if v_mymensingh_id is null or v_dhaka_id is null then
    raise exception 'ALLOCATION_TEST_DEFAULT_WAREHOUSES_MISSING';
  end if;

  insert into auth.users (
    id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at, is_sso_user, is_anonymous
  ) values (
    v_actor_id, 'authenticated', 'authenticated',
    'warehouse-allocation-' || v_actor_id::text || '@example.invalid',
    '', pg_catalog.now(), pg_catalog.now(), pg_catalog.now(), false, false
  );

  insert into public.staff_profiles (user_id, display_name, role, is_active)
  values (v_actor_id, 'Warehouse Allocation Test', 'admin', true);

  insert into public.products (name, slug, price, stock, is_active)
  values ('Allocation product A', 'allocation-a-' || v_actor_id::text, 100, 99, true)
  returning id into v_product_a;

  insert into public.products (name, slug, price, stock, is_active)
  values ('Allocation product B', 'allocation-b-' || v_actor_id::text, 200, 99, true)
  returning id into v_product_b;

  insert into public.warehouse_inventory
    (warehouse_id, product_id, quantity_on_hand, quantity_reserved, reorder_level)
  values
    (v_mymensingh_id, v_product_a, 3, 0, 0),
    (v_dhaka_id, v_product_a, 4, 0, 0),
    (v_dhaka_id, v_product_b, 2, 0, 0);

  insert into public.orders (
    id, order_number, customer_name, customer_phone, shipping_address,
    subtotal, delivery_fee, total, payment_method, payment_status, status
  ) values (
    v_order_id, 'TEST-WH-ALLOC-' || substr(v_actor_id::text, 1, 8),
    'Warehouse Allocation Test', '+8801700000000', 'Test address, Dhaka',
    700, 0, 700, 'cod', 'pending', 'confirmed'
  );

  insert into public.order_items (
    order_id, product_id, product_name_snapshot, unit_price, quantity
  ) values
    (v_order_id, v_product_a, 'Allocation product A', 100, 5),
    (v_order_id, v_product_b, 'Allocation product B', 200, 2);

  v_result := public.allocate_order_to_warehouses(v_order_id, v_actor_id);

  if (v_result->>'allocated')::boolean is not true
     or (v_result->>'total_units_reserved')::integer <> 7
     or (v_result->>'shipment_count')::integer <> 2 then
    raise exception 'ALLOCATION_RESULT_DID_NOT_SPLIT_EXPECTED_ORDER';
  end if;

  select count(*) into v_fulfillments
  from public.order_fulfillments where order_id = v_order_id;
  if v_fulfillments <> 2 then
    raise exception 'EXPECTED_ONE_FULFILLMENT_PER_USED_WAREHOUSE';
  end if;

  select count(*) into v_fulfillment_items
  from public.order_fulfillment_items fi
  join public.order_fulfillments f on f.id = fi.fulfillment_id
  where f.order_id = v_order_id;
  if v_fulfillment_items <> 3 then
    raise exception 'ORDER_LINES_WERE_NOT_SPLIT_ACROSS_WAREHOUSE_FULFILLMENTS';
  end if;

  select quantity_reserved into v_reserved
  from public.warehouse_inventory
  where warehouse_id = v_mymensingh_id and product_id = v_product_a;
  if v_reserved <> 3 then raise exception 'PRIMARY_WAREHOUSE_STOCK_NOT_RESERVED_FIRST'; end if;

  select quantity_reserved into v_reserved
  from public.warehouse_inventory
  where warehouse_id = v_dhaka_id and product_id = v_product_a;
  if v_reserved <> 2 then raise exception 'SECONDARY_WAREHOUSE_STOCK_NOT_RESERVED_FOR_REMAINDER'; end if;

  select count(*) into v_movement_count
  from public.inventory_movements
  where reference_type = 'order_fulfillment'
    and reference_id in (select id from public.order_fulfillments where order_id = v_order_id)
    and movement_type = 'order_reservation';
  if v_movement_count <> 3 then
    raise exception 'ALLOCATION_MOVEMENT_LEDGER_INCOMPLETE';
  end if;

  begin
    perform public.allocate_order_to_warehouses(v_order_id, v_actor_id);
    raise exception 'DUPLICATE_ORDER_ALLOCATION_WAS_ALLOWED';
  exception
    when unique_violation then
      if sqlerrm <> 'WAREHOUSE_ALLOCATION_ALREADY_EXISTS' then raise; end if;
  end;

  insert into public.orders (
    id, order_number, customer_name, customer_phone, shipping_address,
    subtotal, delivery_fee, total, payment_method, payment_status, status
  ) values (
    v_short_order_id, 'TEST-WH-SHORT-' || substr(v_actor_id::text, 1, 8),
    'Warehouse Allocation Test', '+8801700000000', 'Test address, Dhaka',
    900, 0, 900, 'cod', 'pending', 'confirmed'
  );

  insert into public.order_items (
    order_id, product_id, product_name_snapshot, unit_price, quantity
  ) values (
    v_short_order_id, v_product_b, 'Allocation product B', 200, 3
  );

  begin
    perform public.allocate_order_to_warehouses(v_short_order_id, v_actor_id);
    raise exception 'INSUFFICIENT_STOCK_ALLOCATION_WAS_ALLOWED';
  exception
    when check_violation then
      if sqlerrm <> 'WAREHOUSE_ALLOCATION_INSUFFICIENT_STOCK' then raise; end if;
  end;

  if exists (select 1 from public.order_fulfillments where order_id = v_short_order_id) then
    raise exception 'FAILED_ALLOCATION_LEFT_PARTIAL_FULFILLMENTS';
  end if;

  select quantity_reserved into v_reserved
  from public.warehouse_inventory
  where warehouse_id = v_dhaka_id and product_id = v_product_b;
  if v_reserved <> 0 then
    raise exception 'FAILED_ALLOCATION_LEFT_PARTIAL_STOCK_RESERVATION';
  end if;

  if has_function_privilege('anon', 'public.allocate_order_to_warehouses(uuid,uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.allocate_order_to_warehouses(uuid,uuid)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.allocate_order_to_warehouses(uuid,uuid)', 'EXECUTE') then
    raise exception 'ALLOCATION_RPC_PRIVILEGE_BOUNDARY_REGRESSION';
  end if;
end;
$test$;

rollback;
