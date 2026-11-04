-- Disposable PostgreSQL regression tests for the new order throttle and atomic Pathao sync.
-- All fixture rows and limiter counters are rolled back.

begin;

do $test$
declare
  v_actor_id uuid := gen_random_uuid();
  v_order_id uuid := gen_random_uuid();
  v_consignment_id text := 'PATHAO-ATOMIC-' || substr(gen_random_uuid()::text, 1, 8);
  v_result jsonb;
  v_count integer;
  v_allowed boolean;
begin
  -- Order creation limiter: five requests are accepted, the sixth is denied.
  for v_count in 1..5 loop
    v_allowed := public.check_order_creation_rate_limit(repeat('a', 64));
    if v_allowed is not true then
      raise exception 'ORDER_RATE_LIMIT_BLOCKED_BEFORE_THRESHOLD';
    end if;
  end loop;

  v_allowed := public.check_order_creation_rate_limit(repeat('a', 64));
  if v_allowed is not false then
    raise exception 'ORDER_RATE_LIMIT_DID_NOT_BLOCK_SIXTH_REQUEST';
  end if;

  insert into public.orders (
    id, order_number, customer_name, customer_phone, shipping_address,
    subtotal, delivery_fee, total, payment_method, payment_status, status,
    delivery_provider, delivery_status, delivery_consignment_id
  ) values (
    v_order_id, 'TEST-PATHAO-ATOMIC-' || substr(v_order_id::text, 1, 8),
    'Test Customer', '+8801700000000', 'Test address, Dhaka',
    100, 0, 100, 'cod', 'pending', 'shipped',
    'pathao', 'booked', v_consignment_id
  );

  v_result := public.apply_pathao_delivery_status(v_consignment_id, 'in_transit');
  if (v_result->>'updated')::boolean is not true then
    raise exception 'PATHAO_STATUS_DID_NOT_ADVANCE_TO_IN_TRANSIT';
  end if;

  v_result := public.apply_pathao_delivery_status(v_consignment_id, 'picked_up');
  if (coalesce((v_result->>'updated')::boolean, false) is true
     or v_result->>'reason' <> 'stale_status') then
    raise exception 'PATHAO_STALE_STATUS_REGRESSED_ORDER';
  end if;

  if (select delivery_status from public.orders where id = v_order_id) <> 'in_transit' then
    raise exception 'PATHAO_STALE_STATUS_CHANGED_STORED_STATE';
  end if;

  v_result := public.apply_pathao_delivery_status(v_consignment_id, 'delivered');
  if (v_result->>'updated')::boolean is not true then
    raise exception 'PATHAO_STATUS_DID_NOT_ADVANCE_TO_DELIVERED';
  end if;

  v_result := public.apply_pathao_delivery_status(v_consignment_id, 'in_transit');
  if coalesce((v_result->>'updated')::boolean, false) is true
     or v_result->>'reason' <> 'stale_status' then
    raise exception 'PATHAO_TERMINAL_STATUS_WAS_REOPENED';
  end if;

  if has_function_privilege('anon', 'public.check_order_creation_rate_limit(text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.check_order_creation_rate_limit(text)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.check_order_creation_rate_limit(text)', 'EXECUTE') then
    raise exception 'ORDER_RATE_LIMIT_RPC_PRIVILEGE_BOUNDARY_REGRESSION';
  end if;

  if has_function_privilege('anon', 'public.apply_pathao_delivery_status(text,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.apply_pathao_delivery_status(text,text)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.apply_pathao_delivery_status(text,text)', 'EXECUTE') then
    raise exception 'PATHAO_STATUS_RPC_PRIVILEGE_BOUNDARY_REGRESSION';
  end if;
end;
$test$;

rollback;
