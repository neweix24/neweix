-- Atomically associate authenticated customer checkouts with their account.
-- p_customer_id is derived only from the verified server-side auth session.

begin;

CREATE OR REPLACE FUNCTION public.create_order_with_coupon(p_customer_name text, p_customer_phone text, p_customer_email text, p_shipping_address text, p_shipping_city text, p_payment_method text, p_payment_transaction_id text, p_items jsonb, p_coupon_code text, p_customer_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_item record;
  v_product record;
  v_subtotal integer := 0;
  v_fee integer := 0;
  v_discount integer := 0;
  v_total integer := 0;
  v_order_id uuid;
  v_order_number text;
  v_payment_status text;
  v_city text := lower(btrim(coalesce(p_shipping_city, '')));
  v_coupon_id uuid;
  v_coupon_code text := nullif(upper(btrim(coalesce(p_coupon_code, ''))), '');
  v_discount_type text;
  v_discount_value integer;
  v_min_subtotal integer;
  v_max_discount integer;
  v_usage_limit integer;
  v_usage_count integer;
  v_starts_at timestamptz;
  v_expires_at timestamptz;
  v_free_threshold integer := 0;
begin
  if p_items is null or pg_catalog.jsonb_typeof(p_items) <> 'array'
     or pg_catalog.jsonb_array_length(p_items) = 0
     or pg_catalog.jsonb_array_length(p_items) > 50 then
    raise exception 'invalid items';
  end if;

  if exists (
    select 1 from pg_catalog.jsonb_array_elements(p_items) e
    group by (e ->> 'product_id')
    having pg_catalog.count(*) > 1
  ) then
    raise exception 'duplicate product';
  end if;

  if p_payment_method not in ('cod', 'bkash', 'nagad', 'rocket') then
    raise exception 'invalid payment method';
  end if;
  if p_payment_method <> 'cod' and coalesce(btrim(p_payment_transaction_id), '') = '' then
    raise exception 'payment transaction id required';
  end if;

  if v_coupon_code is not null then
    select id, discount_type, discount_value, min_subtotal, max_discount,
           usage_limit, usage_count, starts_at, expires_at
      into v_coupon_id, v_discount_type, v_discount_value, v_min_subtotal,
           v_max_discount, v_usage_limit, v_usage_count, v_starts_at, v_expires_at
      from public.coupons
     where code = v_coupon_code and is_active = true
     for update;

    if not found then raise exception 'coupon invalid'; end if;
    if v_starts_at is not null and v_starts_at > pg_catalog.now() then raise exception 'coupon not started'; end if;
    if v_expires_at is not null and v_expires_at <= pg_catalog.now() then raise exception 'coupon expired'; end if;
    if v_usage_limit is not null and v_usage_count >= v_usage_limit then raise exception 'coupon usage limit reached'; end if;
  end if;

  v_order_id := pg_catalog.gen_random_uuid();
  v_order_number := 'NWX-' || upper(substr(replace(pg_catalog.gen_random_uuid()::text, '-', ''), 1, 10));
  v_payment_status := case when p_payment_method = 'cod' then 'pending' else 'verification_pending' end;

  insert into public.orders (
    id, order_number, customer_id, customer_name, phone, address,
    customer_phone, customer_email, shipping_address, shipping_city,
    payment_method, payment_status, payment_transaction_id,
    coupon_code, discount, subtotal, delivery_fee, total
  ) values (
    v_order_id, v_order_number, p_customer_id, p_customer_name, p_customer_phone, p_shipping_address,
    p_customer_phone, p_customer_email, p_shipping_address, p_shipping_city,
    p_payment_method, v_payment_status,
    case when p_payment_method = 'cod' then null else btrim(p_payment_transaction_id) end,
    v_coupon_code, 0, 0, 0, 0
  );

  for v_item in
    select (e ->> 'product_id')::uuid as product_id,
           (e ->> 'quantity')::integer as quantity
      from pg_catalog.jsonb_array_elements(p_items) e
     order by 1
  loop
    if v_item.quantity is null or v_item.quantity < 1 or v_item.quantity > 100 then
      raise exception 'invalid quantity';
    end if;

    select id, name, price, stock into v_product
      from public.products
     where id = v_item.product_id and is_active = true
     for update;

    if not found then raise exception 'product unavailable'; end if;
    if v_product.stock < v_item.quantity then raise exception 'insufficient stock for %', v_product.name; end if;

    update public.products set stock = stock - v_item.quantity where id = v_product.id;

    if exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'order_items' and column_name = 'product_name'
    ) and exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'order_items' and column_name = 'line_total'
    ) then
      execute 'insert into public.order_items (order_id, product_id, product_name, unit_price, quantity, line_total) values ($1, $2, $3, $4, $5, $6)'
        using v_order_id, v_product.id, v_product.name, v_product.price, v_item.quantity,
              round(v_product.price * v_item.quantity)::numeric;
    elsif exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'order_items' and column_name = 'product_name_snapshot'
    ) then
      execute 'insert into public.order_items (order_id, product_id, product_name_snapshot, unit_price, quantity) values ($1, $2, $3, $4, $5)'
        using v_order_id, v_product.id, v_product.name, v_product.price, v_item.quantity;
    else
      raise exception 'unsupported order_items schema';
    end if;

    v_subtotal := v_subtotal + round(v_product.price * v_item.quantity)::integer;
  end loop;

  select coalesce(
    (select (value #>> '{}')::integer from public.shop_settings
      where key = case when v_city ~ '(dhaka|ঢাকা)' then 'delivery_fee_dhaka' else 'delivery_fee_outside' end),
    case when v_city ~ '(dhaka|ঢাকা)' then 80 else 130 end
  ) into v_fee;
  v_fee := greatest(0, v_fee);

  select coalesce((select (value #>> '{}')::integer from public.shop_settings where key = 'free_delivery_threshold'), 0)
    into v_free_threshold;
  if v_free_threshold > 0 and v_subtotal >= v_free_threshold then v_fee := 0; end if;

  if v_coupon_code is not null then
    if v_subtotal < coalesce(v_min_subtotal, 0) then raise exception 'coupon minimum subtotal not met'; end if;
    if v_discount_type = 'percentage' then
      v_discount := floor(v_subtotal::numeric * v_discount_value / 100)::integer;
    elsif v_discount_type = 'fixed' then
      v_discount := least(v_subtotal, v_discount_value);
    elsif v_discount_type = 'free_shipping' then
      v_fee := 0;
      v_discount := 0;
    end if;
    if v_max_discount is not null then v_discount := least(v_discount, v_max_discount); end if;
    v_discount := least(v_subtotal, greatest(0, v_discount));
    update public.coupons set usage_count = usage_count + 1, updated_at = pg_catalog.now() where id = v_coupon_id;
  end if;

  v_total := greatest(0, v_subtotal + v_fee - v_discount);
  update public.orders
     set subtotal = v_subtotal, delivery_fee = v_fee, discount = v_discount, total = v_total
   where id = v_order_id;

  return pg_catalog.jsonb_build_object(
    'id', v_order_id,
    'order_number', v_order_number,
    'status', 'pending',
    'payment_status', v_payment_status,
    'subtotal', v_subtotal,
    'discount', v_discount,
    'coupon_code', v_coupon_code,
    'delivery_fee', v_fee,
    'total', v_total
  );
end;
$function$


revoke all on function public.create_order_with_coupon(text, text, text, text, text, text, text, jsonb, text, uuid)
  from public, anon, authenticated;
grant execute on function public.create_order_with_coupon(text, text, text, text, text, text, text, jsonb, text, uuid)
  to service_role;

commit;
