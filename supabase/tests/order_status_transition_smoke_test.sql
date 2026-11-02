-- Disposable PostgreSQL behavior test for terminal order states and one-time cancellation restocking.
-- All fixture rows and stock changes are rolled back.

begin;

do $test$
declare
  v_actor_id uuid := gen_random_uuid();
  v_product_id uuid;
  v_cancel_order_id uuid := gen_random_uuid();
  v_shipped_order_id uuid := gen_random_uuid();
  v_booked_order_id uuid := gen_random_uuid();
  v_stock integer;
  v_result jsonb;
begin
  insert into auth.users (
    id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    is_sso_user, is_anonymous
  ) values (
    v_actor_id, 'authenticated', 'authenticated',
    'order-transition-test-' || v_actor_id::text || '@example.invalid',
    '', pg_catalog.now(), pg_catalog.now(), pg_catalog.now(), false, false
  );

  insert into public.staff_profiles (user_id, display_name, role, is_active)
  values (v_actor_id, 'Order Transition Test', 'admin', true);

  insert into public.products (name, slug, price, stock, is_active)
  values ('Order transition test product', 'order-transition-test-' || v_actor_id::text, 100, 10, true)
  returning id into v_product_id;

  insert into public.orders (
    id, order_number, customer_name, customer_phone, shipping_address,
    subtotal, delivery_fee, total, payment_method, payment_status, status
  ) values (
    v_cancel_order_id, 'TEST-CANCEL-' || substr(v_actor_id::text, 1, 8),
    'Test Customer', '+8801700000000', 'Test address, Dhaka',
    200, 0, 200, 'cod', 'pending', 'pending'
  );

  insert into public.order_items (
    order_id, product_id, product_name, quantity, unit_price, line_total
  ) values (
    v_cancel_order_id, v_product_id, 'Order transition test product', 2, 100, 200
  );

  v_result := public.admin_update_order_status(v_cancel_order_id, 'cancelled', v_actor_id);
  select stock into v_stock from public.products where id = v_product_id;
  if v_stock <> 12 or (v_result->>'inventory_restocked')::boolean is not true then
    raise exception 'ORDER_CANCEL_DID_NOT_RESTORE_STOCK_ONCE';
  end if;

  v_result := public.admin_update_order_status(v_cancel_order_id, 'cancelled', v_actor_id);
  select stock into v_stock from public.products where id = v_product_id;
  if v_stock <> 12 or (v_result->>'changed')::boolean is not false then
    raise exception 'REPEATED_CANCEL_CHANGED_INVENTORY';
  end if;

  begin
    perform public.admin_update_order_status(v_cancel_order_id, 'processing', v_actor_id);
    raise exception 'CANCELLED_ORDER_WAS_REOPENED';
  exception
    when sqlstate '22023' then
      if sqlerrm <> 'INVALID_ORDER_STATUS_TRANSITION' then raise; end if;
  end;

  select stock into v_stock from public.products where id = v_product_id;
  if v_stock <> 12 then
    raise exception 'REOPEN_ATTEMPT_CHANGED_INVENTORY';
  end if;

  insert into public.orders (
    id, order_number, customer_name, customer_phone, shipping_address,
    subtotal, delivery_fee, total, payment_method, payment_status, status
  ) values (
    v_shipped_order_id, 'TEST-SHIPPED-' || substr(v_actor_id::text, 1, 8),
    'Test Customer', '+8801700000000', 'Test address, Dhaka',
    100, 0, 100, 'cod', 'pending', 'shipped'
  );

  insert into public.order_items (
    order_id, product_id, product_name, quantity, unit_price, line_total
  ) values (
    v_shipped_order_id, v_product_id, 'Order transition test product', 1, 100, 100
  );

  begin
    perform public.admin_update_order_status(v_shipped_order_id, 'cancelled', v_actor_id);
    raise exception 'SHIPPED_ORDER_WAS_CANCELLED';
  exception
    when sqlstate '22023' then
      if sqlerrm <> 'INVALID_ORDER_STATUS_TRANSITION' then raise; end if;
  end;

  select stock into v_stock from public.products where id = v_product_id;
  if v_stock <> 12 then
    raise exception 'SHIPPED_ORDER_CANCELLATION_CHANGED_INVENTORY';
  end if;

  insert into public.orders (
    id, order_number, customer_name, customer_phone, shipping_address,
    subtotal, delivery_fee, total, payment_method, payment_status, status,
    delivery_provider, delivery_status
  ) values (
    v_booked_order_id, 'TEST-BOOKED-' || substr(v_actor_id::text, 1, 8),
    'Test Customer', '+8801700000000', 'Test address, Dhaka',
    100, 0, 100, 'cod', 'pending', 'packed', 'pathao', 'booking'
  );

  insert into public.order_items (
    order_id, product_id, product_name, quantity, unit_price, line_total
  ) values (
    v_booked_order_id, v_product_id, 'Order transition test product', 1, 100, 100
  );

  begin
    perform public.admin_update_order_status(v_booked_order_id, 'cancelled', v_actor_id);
    raise exception 'ACTIVE_COURIER_BOOKING_WAS_CANCELLED';
  exception
    when sqlstate '55000' then
      if sqlerrm <> 'ORDER_DELIVERY_MUST_BE_CANCELLED_FIRST' then raise; end if;
  end;

  select stock into v_stock from public.products where id = v_product_id;
  if v_stock <> 12 then
    raise exception 'COURIER_BOOKING_CANCELLATION_CHANGED_INVENTORY';
  end if;

  -- A timeout remains in 'booking' and must fail closed until reconciled.
  -- A definite provider rejection is marked 'failed' and may be cancelled.
  update public.orders
     set delivery_status = 'failed'
   where id = v_booked_order_id;

  v_result := public.admin_update_order_status(v_booked_order_id, 'cancelled', v_actor_id);
  select stock into v_stock from public.products where id = v_product_id;
  if v_stock <> 13 or (v_result->>'inventory_restocked')::boolean is not true then
    raise exception 'DEFINITE_PATHAO_FAILURE_DID_NOT_RESTORE_STOCK';
  end if;

  v_result := public.admin_update_order_status(v_booked_order_id, 'cancelled', v_actor_id);
  select stock into v_stock from public.products where id = v_product_id;
  if v_stock <> 13 or (v_result->>'changed')::boolean is not false then
    raise exception 'REPEATED_PATHAO_FAILURE_CANCEL_CHANGED_INVENTORY';
  end if;

  if has_function_privilege('anon', 'public.admin_update_order_status(uuid,text,uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.admin_update_order_status(uuid,text,uuid)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.admin_update_order_status(uuid,text,uuid)', 'EXECUTE') then
    raise exception 'ORDER_STATUS_RPC_PRIVILEGE_BOUNDARY_REGRESSION';
  end if;
end;
$test$;

rollback;
