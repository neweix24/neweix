-- Disposable test for NEWEIX multi-warehouse schema and safe legacy-stock handling.
-- All fixture rows are rolled back.

begin;

do $test$
declare
  v_product_id uuid;
  v_mymensingh_id uuid;
  v_dhaka_id uuid;
  v_stock integer;
  v_inventory_count integer;
begin
  select id into v_mymensingh_id from public.warehouses where code = 'MYMENSINGH-HQ';
  select id into v_dhaka_id from public.warehouses where code = 'DHAKA-DC';

  if v_mymensingh_id is null or v_dhaka_id is null then
    raise exception 'DEFAULT_MYMENSINGH_AND_DHAKA_WAREHOUSES_MISSING';
  end if;

  if not exists (
    select 1 from public.warehouses
    where id = v_mymensingh_id and is_primary = true and is_active = true
  ) then
    raise exception 'MYMENSINGH_MUST_REMAIN_PRIMARY_HEADQUARTERS';
  end if;

  insert into public.products (name, slug, price, stock, is_active)
  values ('Multi warehouse test product', 'multi-warehouse-test-' || gen_random_uuid()::text, 100, 7, true)
  returning id, stock into v_product_id, v_stock;

  select count(*) into v_inventory_count
  from public.warehouse_inventory where product_id = v_product_id;
  if v_stock <> 7 or v_inventory_count <> 0 then
    raise exception 'LEGACY_STOCK_MUST_NOT_BE_GUESSED_OR_AUTO_ASSIGNED_TO_A_WAREHOUSE';
  end if;

  insert into public.warehouse_inventory
    (warehouse_id, product_id, quantity_on_hand, quantity_reserved, reorder_level)
  values
    (v_mymensingh_id, v_product_id, 3, 1, 1),
    (v_dhaka_id, v_product_id, 4, 0, 1);

  select count(*) into v_inventory_count
  from public.warehouse_inventory
  where product_id = v_product_id and quantity_on_hand - quantity_reserved >= 0;
  if v_inventory_count <> 2 then
    raise exception 'PRODUCT_STOCK_COULD_NOT_BE_REPRESENTED_ACROSS_TWO_ORIGINS';
  end if;

  begin
    insert into public.warehouse_inventory
      (warehouse_id, product_id, quantity_on_hand, quantity_reserved)
    values (v_mymensingh_id, v_product_id, 1, 2);
    raise exception 'RESERVED_STOCK_EXCEEDED_ON_HAND';
  exception
    when check_violation then null;
  end;

  if has_table_privilege('anon', 'public.warehouses', 'SELECT')
     or has_table_privilege('authenticated', 'public.warehouse_inventory', 'SELECT')
     or has_table_privilege('authenticated', 'public.order_fulfillments', 'INSERT')
     or not has_table_privilege('service_role', 'public.warehouses', 'SELECT') then
    raise exception 'WAREHOUSE_SERVER_ONLY_PRIVILEGE_BOUNDARY_REGRESSION';
  end if;
end;
$test$;

rollback;
