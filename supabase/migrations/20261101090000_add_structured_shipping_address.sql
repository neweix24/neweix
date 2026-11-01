-- Store validated administrative address levels on every new checkout order.
-- The original 12-argument RPC remains for compatibility; the checkout API uses this
-- service-role-only overload with the structured address fields.

alter table public.orders
  add column if not exists shipping_division_code text,
  add column if not exists shipping_division text,
  add column if not exists shipping_district_code text,
  add column if not exists shipping_district text,
  add column if not exists shipping_upazila_code text,
  add column if not exists shipping_upazila text,
  add column if not exists shipping_union_code text,
  add column if not exists shipping_union text,
  add column if not exists shipping_union_other text,
  add column if not exists shipping_village text;

alter table public.orders
  drop constraint if exists orders_shipping_division_code_format,
  drop constraint if exists orders_shipping_district_code_format,
  drop constraint if exists orders_shipping_upazila_code_format,
  drop constraint if exists orders_shipping_union_code_format;

alter table public.orders
  add constraint orders_shipping_division_code_format
    check (shipping_division_code is null or shipping_division_code ~ '^BD-D[0-9]{2}$') not valid,
  add constraint orders_shipping_district_code_format
    check (shipping_district_code is null or shipping_district_code ~ '^BD-D[0-9]{2}-Z[0-9]{2}$') not valid,
  add constraint orders_shipping_upazila_code_format
    check (shipping_upazila_code is null or shipping_upazila_code = 'other' or shipping_upazila_code ~ '^BD-D[0-9]{2}-Z[0-9]{2}-U[0-9]{3},
  add constraint orders_shipping_union_code_format
    check (shipping_union_code is null or shipping_union_code in ('not_applicable','other') or shipping_union_code ~ '^BD-D[0-9]{2}-Z[0-9]{2}-U[0-9]{3}-N[0-9]{4}$') not valid;

create index if not exists orders_shipping_district_code_idx
  on public.orders (shipping_district_code)
  where shipping_district_code is not null;

create index if not exists orders_shipping_upazila_code_idx
  on public.orders (shipping_upazila_code)
  where shipping_upazila_code is not null;

create or replace function public.create_order_with_prepaid_delivery(
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text,
  p_shipping_address text,
  p_shipping_city text,
  p_payment_method text,
  p_payment_transaction_id text,
  p_items jsonb,
  p_coupon_code text,
  p_customer_id uuid,
  p_delivery_fee_payment_method text,
  p_delivery_fee_payment_transaction_id text,
  p_shipping_division_code text,
  p_shipping_division text,
  p_shipping_district_code text,
  p_shipping_district text,
  p_shipping_upazila_code text,
  p_shipping_upazila text,
  p_shipping_union_code text,
  p_shipping_union text,
  p_shipping_union_other text,
  p_shipping_village text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_order jsonb;
  v_order_id uuid;
  v_fee numeric;
  v_delivery_method text := nullif(pg_catalog.btrim(p_delivery_fee_payment_method), '');
  v_delivery_transaction text := nullif(pg_catalog.btrim(p_delivery_fee_payment_transaction_id), '');
begin
  if p_payment_method not in ('cod','bkash','nagad','rocket') then
    raise exception 'INVALID_PAYMENT_METHOD';
  end if;

  if p_shipping_union_code is null
     or p_shipping_division_code is null
     or p_shipping_district_code is null
     or p_shipping_upazila_code is null
     or p_shipping_division_code !~ '^BD-D[0-9]{2}$'
     or p_shipping_district_code !~ '^BD-D[0-9]{2}-Z[0-9]{2}$'
     or (p_shipping_upazila_code <> 'other' and p_shipping_upazila_code !~ '^BD-D[0-9]{2}-Z[0-9]{2}-U[0-9]{3}     or (p_shipping_union_code not in ('not_applicable','other')
         and p_shipping_union_code !~ '^BD-D[0-9]{2}-Z[0-9]{2}-U[0-9]{3}-N[0-9]{4}$')
     or pg_catalog.char_length(pg_catalog.btrim(p_shipping_division)) < 2
     or pg_catalog.char_length(pg_catalog.btrim(p_shipping_district)) < 2
     or pg_catalog.char_length(pg_catalog.btrim(p_shipping_upazila)) < 2
     or pg_catalog.char_length(pg_catalog.btrim(p_shipping_village)) < 2
     or pg_catalog.char_length(pg_catalog.btrim(p_shipping_village)) > 160 then
    raise exception 'INVALID_STRUCTURED_SHIPPING_ADDRESS';
  end if;

  if p_shipping_union_code = 'other' and
     (p_shipping_union_other is null
      or pg_catalog.char_length(pg_catalog.btrim(p_shipping_union_other)) < 2
      or pg_catalog.char_length(pg_catalog.btrim(p_shipping_union_other)) > 120) then
    raise exception 'INVALID_OTHER_SHIPPING_AREA';
  end if;

  if p_payment_method = 'cod' then
    if p_payment_transaction_id is not null then
      raise exception 'COD_PRODUCT_PAYMENT_MUST_BE_EMPTY';
    end if;
    if (v_delivery_method is null) <> (v_delivery_transaction is null) then
      raise exception 'DELIVERY_FEE_PAYMENT_DETAILS_INCOMPLETE';
    end if;
    if v_delivery_method is not null and v_delivery_method not in ('bkash','nagad','rocket') then
      raise exception 'INVALID_DELIVERY_FEE_PAYMENT_METHOD';
    end if;
    if v_delivery_transaction is not null and (
      length(v_delivery_transaction) > 120 or
      v_delivery_transaction !~ '^[A-Za-z0-9-]+$'
    ) then
      raise exception 'INVALID_DELIVERY_FEE_TRANSACTION';
    end if;
  else
    if coalesce(btrim(p_payment_transaction_id),'') = ''
       or length(btrim(p_payment_transaction_id)) > 120
       or btrim(p_payment_transaction_id) !~ '^[A-Za-z0-9-]+$' then
      raise exception 'PRODUCT_PAYMENT_TRANSACTION_REQUIRED';
    end if;
    if v_delivery_method is not null or v_delivery_transaction is not null then
      raise exception 'DUPLICATE_DELIVERY_FEE_PAYMENT_NOT_ALLOWED';
    end if;
  end if;

  v_order := public.create_order_with_coupon(
    p_customer_name, p_customer_phone, p_customer_email, p_shipping_address,
    p_shipping_city, p_payment_method, p_payment_transaction_id, p_items,
    p_coupon_code, p_customer_id
  );
  v_order_id := (v_order ->> 'id')::uuid;
  v_fee := coalesce((v_order ->> 'delivery_fee')::numeric,0);

  if p_payment_method = 'cod' and v_fee > 0 then
    if v_delivery_method is null or v_delivery_transaction is null then
      raise exception 'DELIVERY_FEE_MFS_REQUIRED';
    end if;

    update public.orders set
      delivery_fee_payment_method = v_delivery_method,
      delivery_fee_payment_transaction_id = v_delivery_transaction,
      delivery_fee_payment_status = 'verification_pending'
    where id = v_order_id;
  else
    update public.orders set
      delivery_fee_payment_method = null,
      delivery_fee_payment_transaction_id = null,
      delivery_fee_payment_status = 'not_required'
    where id = v_order_id;
  end if;

  update public.orders set
    shipping_division_code = p_shipping_division_code,
    shipping_division = pg_catalog.btrim(p_shipping_division),
    shipping_district_code = p_shipping_district_code,
    shipping_district = pg_catalog.btrim(p_shipping_district),
    shipping_upazila_code = p_shipping_upazila_code,
    shipping_upazila = pg_catalog.btrim(p_shipping_upazila),
    shipping_union_code = p_shipping_union_code,
    shipping_union = nullif(pg_catalog.btrim(coalesce(p_shipping_union,'')), ''),
    shipping_union_other = nullif(pg_catalog.btrim(coalesce(p_shipping_union_other,'')), ''),
    shipping_village = pg_catalog.btrim(p_shipping_village),
    shipping_city = pg_catalog.btrim(p_shipping_district)
  where id = v_order_id;

  return v_order || pg_catalog.jsonb_build_object(
    'delivery_fee_payment_status',
    case when p_payment_method = 'cod' and v_fee > 0 then 'verification_pending' else 'not_required' end,
    'shipping_division_code', p_shipping_division_code,
    'shipping_division', pg_catalog.btrim(p_shipping_division),
    'shipping_district_code', p_shipping_district_code,
    'shipping_district', pg_catalog.btrim(p_shipping_district),
    'shipping_upazila_code', p_shipping_upazila_code,
    'shipping_upazila', pg_catalog.btrim(p_shipping_upazila),
    'shipping_union_code', p_shipping_union_code,
    'shipping_union', nullif(pg_catalog.btrim(coalesce(p_shipping_union,'')), ''),
    'shipping_village', pg_catalog.btrim(p_shipping_village)
  );
end;
$function$;

revoke all on function public.create_order_with_prepaid_delivery(
  text,text,text,text,text,text,text,jsonb,text,uuid,text,text,
  text,text,text,text,text,text,text,text,text,text
) from public, anon, authenticated;

grant execute on function public.create_order_with_prepaid_delivery(
  text,text,text,text,text,text,text,jsonb,text,uuid,text,text,
  text,text,text,text,text,text,text,text,text,text
) to service_role;
) not valid,
  add constraint orders_shipping_union_code_format
    check (shipping_union_code is null or shipping_union_code in ('not_applicable','other') or shipping_union_code ~ '^BD-D[0-9]{2}-Z[0-9]{2}-U[0-9]{3}-N[0-9]{4}$') not valid;

create index if not exists orders_shipping_district_code_idx
  on public.orders (shipping_district_code)
  where shipping_district_code is not null;

create index if not exists orders_shipping_upazila_code_idx
  on public.orders (shipping_upazila_code)
  where shipping_upazila_code is not null;

create or replace function public.create_order_with_prepaid_delivery(
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text,
  p_shipping_address text,
  p_shipping_city text,
  p_payment_method text,
  p_payment_transaction_id text,
  p_items jsonb,
  p_coupon_code text,
  p_customer_id uuid,
  p_delivery_fee_payment_method text,
  p_delivery_fee_payment_transaction_id text,
  p_shipping_division_code text,
  p_shipping_division text,
  p_shipping_district_code text,
  p_shipping_district text,
  p_shipping_upazila_code text,
  p_shipping_upazila text,
  p_shipping_union_code text,
  p_shipping_union text,
  p_shipping_union_other text,
  p_shipping_village text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_order jsonb;
  v_order_id uuid;
  v_fee numeric;
  v_delivery_method text := nullif(pg_catalog.btrim(p_delivery_fee_payment_method), '');
  v_delivery_transaction text := nullif(pg_catalog.btrim(p_delivery_fee_payment_transaction_id), '');
begin
  if p_payment_method not in ('cod','bkash','nagad','rocket') then
    raise exception 'INVALID_PAYMENT_METHOD';
  end if;

  if p_shipping_union_code is null
     or p_shipping_division_code is null
     or p_shipping_district_code is null
     or p_shipping_upazila_code is null
     or p_shipping_division_code !~ '^BD-D[0-9]{2}$'
     or p_shipping_district_code !~ '^BD-D[0-9]{2}-Z[0-9]{2}$'
     or p_shipping_upazila_code !~ '^BD-D[0-9]{2}-Z[0-9]{2}-U[0-9]{3}$'
     or (p_shipping_union_code not in ('not_applicable','other')
         and p_shipping_union_code !~ '^BD-D[0-9]{2}-Z[0-9]{2}-U[0-9]{3}-N[0-9]{4}$')
     or pg_catalog.char_length(pg_catalog.btrim(p_shipping_division)) < 2
     or pg_catalog.char_length(pg_catalog.btrim(p_shipping_district)) < 2
     or pg_catalog.char_length(pg_catalog.btrim(p_shipping_upazila)) < 2
     or pg_catalog.char_length(pg_catalog.btrim(p_shipping_village)) < 2
     or pg_catalog.char_length(pg_catalog.btrim(p_shipping_village)) > 160 then
    raise exception 'INVALID_STRUCTURED_SHIPPING_ADDRESS';
  end if;

  if p_shipping_union_code = 'other' and
     (p_shipping_union_other is null
      or pg_catalog.char_length(pg_catalog.btrim(p_shipping_union_other)) < 2
      or pg_catalog.char_length(pg_catalog.btrim(p_shipping_union_other)) > 120) then
    raise exception 'INVALID_OTHER_SHIPPING_AREA';
  end if;

  if p_payment_method = 'cod' then
    if p_payment_transaction_id is not null then
      raise exception 'COD_PRODUCT_PAYMENT_MUST_BE_EMPTY';
    end if;
    if (v_delivery_method is null) <> (v_delivery_transaction is null) then
      raise exception 'DELIVERY_FEE_PAYMENT_DETAILS_INCOMPLETE';
    end if;
    if v_delivery_method is not null and v_delivery_method not in ('bkash','nagad','rocket') then
      raise exception 'INVALID_DELIVERY_FEE_PAYMENT_METHOD';
    end if;
    if v_delivery_transaction is not null and (
      length(v_delivery_transaction) > 120 or
      v_delivery_transaction !~ '^[A-Za-z0-9-]+$'
    ) then
      raise exception 'INVALID_DELIVERY_FEE_TRANSACTION';
    end if;
  else
    if coalesce(btrim(p_payment_transaction_id),'') = ''
       or length(btrim(p_payment_transaction_id)) > 120
       or btrim(p_payment_transaction_id) !~ '^[A-Za-z0-9-]+$' then
      raise exception 'PRODUCT_PAYMENT_TRANSACTION_REQUIRED';
    end if;
    if v_delivery_method is not null or v_delivery_transaction is not null then
      raise exception 'DUPLICATE_DELIVERY_FEE_PAYMENT_NOT_ALLOWED';
    end if;
  end if;

  v_order := public.create_order_with_coupon(
    p_customer_name, p_customer_phone, p_customer_email, p_shipping_address,
    p_shipping_city, p_payment_method, p_payment_transaction_id, p_items,
    p_coupon_code, p_customer_id
  );
  v_order_id := (v_order ->> 'id')::uuid;
  v_fee := coalesce((v_order ->> 'delivery_fee')::numeric,0);

  if p_payment_method = 'cod' and v_fee > 0 then
    if v_delivery_method is null or v_delivery_transaction is null then
      raise exception 'DELIVERY_FEE_MFS_REQUIRED';
    end if;

    update public.orders set
      delivery_fee_payment_method = v_delivery_method,
      delivery_fee_payment_transaction_id = v_delivery_transaction,
      delivery_fee_payment_status = 'verification_pending'
    where id = v_order_id;
  else
    update public.orders set
      delivery_fee_payment_method = null,
      delivery_fee_payment_transaction_id = null,
      delivery_fee_payment_status = 'not_required'
    where id = v_order_id;
  end if;

  update public.orders set
    shipping_division_code = p_shipping_division_code,
    shipping_division = pg_catalog.btrim(p_shipping_division),
    shipping_district_code = p_shipping_district_code,
    shipping_district = pg_catalog.btrim(p_shipping_district),
    shipping_upazila_code = p_shipping_upazila_code,
    shipping_upazila = pg_catalog.btrim(p_shipping_upazila),
    shipping_union_code = p_shipping_union_code,
    shipping_union = nullif(pg_catalog.btrim(coalesce(p_shipping_union,'')), ''),
    shipping_union_other = nullif(pg_catalog.btrim(coalesce(p_shipping_union_other,'')), ''),
    shipping_village = pg_catalog.btrim(p_shipping_village),
    shipping_city = pg_catalog.btrim(p_shipping_district)
  where id = v_order_id;

  return v_order || pg_catalog.jsonb_build_object(
    'delivery_fee_payment_status',
    case when p_payment_method = 'cod' and v_fee > 0 then 'verification_pending' else 'not_required' end,
    'shipping_division_code', p_shipping_division_code,
    'shipping_division', pg_catalog.btrim(p_shipping_division),
    'shipping_district_code', p_shipping_district_code,
    'shipping_district', pg_catalog.btrim(p_shipping_district),
    'shipping_upazila_code', p_shipping_upazila_code,
    'shipping_upazila', pg_catalog.btrim(p_shipping_upazila),
    'shipping_union_code', p_shipping_union_code,
    'shipping_union', nullif(pg_catalog.btrim(coalesce(p_shipping_union,'')), ''),
    'shipping_village', pg_catalog.btrim(p_shipping_village)
  );
end;
$function$;

revoke all on function public.create_order_with_prepaid_delivery(
  text,text,text,text,text,text,text,jsonb,text,uuid,text,text,
  text,text,text,text,text,text,text,text,text,text
) from public, anon, authenticated;

grant execute on function public.create_order_with_prepaid_delivery(
  text,text,text,text,text,text,text,jsonb,text,uuid,text,text,
  text,text,text,text,text,text,text,text,text,text
) to service_role;
)
     or p_shipping_upazila is null
     or (p_shipping_union_code not in ('not_applicable','other')
         and p_shipping_union_code !~ '^BD-D[0-9]{2}-Z[0-9]{2}-U[0-9]{3}-N[0-9]{4}$')
     or pg_catalog.char_length(pg_catalog.btrim(p_shipping_division)) < 2
     or pg_catalog.char_length(pg_catalog.btrim(p_shipping_district)) < 2
     or pg_catalog.char_length(pg_catalog.btrim(p_shipping_upazila)) < 2
     or pg_catalog.char_length(pg_catalog.btrim(p_shipping_village)) < 2
     or pg_catalog.char_length(pg_catalog.btrim(p_shipping_village)) > 160 then
    raise exception 'INVALID_STRUCTURED_SHIPPING_ADDRESS';
  end if;

  if p_shipping_union_code = 'other' and
     (p_shipping_union_other is null
      or pg_catalog.char_length(pg_catalog.btrim(p_shipping_union_other)) < 2
      or pg_catalog.char_length(pg_catalog.btrim(p_shipping_union_other)) > 120) then
    raise exception 'INVALID_OTHER_SHIPPING_AREA';
  end if;

  if p_payment_method = 'cod' then
    if p_payment_transaction_id is not null then
      raise exception 'COD_PRODUCT_PAYMENT_MUST_BE_EMPTY';
    end if;
    if (v_delivery_method is null) <> (v_delivery_transaction is null) then
      raise exception 'DELIVERY_FEE_PAYMENT_DETAILS_INCOMPLETE';
    end if;
    if v_delivery_method is not null and v_delivery_method not in ('bkash','nagad','rocket') then
      raise exception 'INVALID_DELIVERY_FEE_PAYMENT_METHOD';
    end if;
    if v_delivery_transaction is not null and (
      length(v_delivery_transaction) > 120 or
      v_delivery_transaction !~ '^[A-Za-z0-9-]+$'
    ) then
      raise exception 'INVALID_DELIVERY_FEE_TRANSACTION';
    end if;
  else
    if coalesce(btrim(p_payment_transaction_id),'') = ''
       or length(btrim(p_payment_transaction_id)) > 120
       or btrim(p_payment_transaction_id) !~ '^[A-Za-z0-9-]+$' then
      raise exception 'PRODUCT_PAYMENT_TRANSACTION_REQUIRED';
    end if;
    if v_delivery_method is not null or v_delivery_transaction is not null then
      raise exception 'DUPLICATE_DELIVERY_FEE_PAYMENT_NOT_ALLOWED';
    end if;
  end if;

  v_order := public.create_order_with_coupon(
    p_customer_name, p_customer_phone, p_customer_email, p_shipping_address,
    p_shipping_city, p_payment_method, p_payment_transaction_id, p_items,
    p_coupon_code, p_customer_id
  );
  v_order_id := (v_order ->> 'id')::uuid;
  v_fee := coalesce((v_order ->> 'delivery_fee')::numeric,0);

  if p_payment_method = 'cod' and v_fee > 0 then
    if v_delivery_method is null or v_delivery_transaction is null then
      raise exception 'DELIVERY_FEE_MFS_REQUIRED';
    end if;

    update public.orders set
      delivery_fee_payment_method = v_delivery_method,
      delivery_fee_payment_transaction_id = v_delivery_transaction,
      delivery_fee_payment_status = 'verification_pending'
    where id = v_order_id;
  else
    update public.orders set
      delivery_fee_payment_method = null,
      delivery_fee_payment_transaction_id = null,
      delivery_fee_payment_status = 'not_required'
    where id = v_order_id;
  end if;

  update public.orders set
    shipping_division_code = p_shipping_division_code,
    shipping_division = pg_catalog.btrim(p_shipping_division),
    shipping_district_code = p_shipping_district_code,
    shipping_district = pg_catalog.btrim(p_shipping_district),
    shipping_upazila_code = p_shipping_upazila_code,
    shipping_upazila = pg_catalog.btrim(p_shipping_upazila),
    shipping_union_code = p_shipping_union_code,
    shipping_union = nullif(pg_catalog.btrim(coalesce(p_shipping_union,'')), ''),
    shipping_union_other = nullif(pg_catalog.btrim(coalesce(p_shipping_union_other,'')), ''),
    shipping_village = pg_catalog.btrim(p_shipping_village),
    shipping_city = pg_catalog.btrim(p_shipping_district)
  where id = v_order_id;

  return v_order || pg_catalog.jsonb_build_object(
    'delivery_fee_payment_status',
    case when p_payment_method = 'cod' and v_fee > 0 then 'verification_pending' else 'not_required' end,
    'shipping_division_code', p_shipping_division_code,
    'shipping_division', pg_catalog.btrim(p_shipping_division),
    'shipping_district_code', p_shipping_district_code,
    'shipping_district', pg_catalog.btrim(p_shipping_district),
    'shipping_upazila_code', p_shipping_upazila_code,
    'shipping_upazila', pg_catalog.btrim(p_shipping_upazila),
    'shipping_union_code', p_shipping_union_code,
    'shipping_union', nullif(pg_catalog.btrim(coalesce(p_shipping_union,'')), ''),
    'shipping_village', pg_catalog.btrim(p_shipping_village)
  );
end;
$function$;

revoke all on function public.create_order_with_prepaid_delivery(
  text,text,text,text,text,text,text,jsonb,text,uuid,text,text,
  text,text,text,text,text,text,text,text,text,text
) from public, anon, authenticated;

grant execute on function public.create_order_with_prepaid_delivery(
  text,text,text,text,text,text,text,jsonb,text,uuid,text,text,
  text,text,text,text,text,text,text,text,text,text
) to service_role;
) not valid,
  add constraint orders_shipping_union_code_format
    check (shipping_union_code is null or shipping_union_code in ('not_applicable','other') or shipping_union_code ~ '^BD-D[0-9]{2}-Z[0-9]{2}-U[0-9]{3}-N[0-9]{4}$') not valid;

create index if not exists orders_shipping_district_code_idx
  on public.orders (shipping_district_code)
  where shipping_district_code is not null;

create index if not exists orders_shipping_upazila_code_idx
  on public.orders (shipping_upazila_code)
  where shipping_upazila_code is not null;

create or replace function public.create_order_with_prepaid_delivery(
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text,
  p_shipping_address text,
  p_shipping_city text,
  p_payment_method text,
  p_payment_transaction_id text,
  p_items jsonb,
  p_coupon_code text,
  p_customer_id uuid,
  p_delivery_fee_payment_method text,
  p_delivery_fee_payment_transaction_id text,
  p_shipping_division_code text,
  p_shipping_division text,
  p_shipping_district_code text,
  p_shipping_district text,
  p_shipping_upazila_code text,
  p_shipping_upazila text,
  p_shipping_union_code text,
  p_shipping_union text,
  p_shipping_union_other text,
  p_shipping_village text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_order jsonb;
  v_order_id uuid;
  v_fee numeric;
  v_delivery_method text := nullif(pg_catalog.btrim(p_delivery_fee_payment_method), '');
  v_delivery_transaction text := nullif(pg_catalog.btrim(p_delivery_fee_payment_transaction_id), '');
begin
  if p_payment_method not in ('cod','bkash','nagad','rocket') then
    raise exception 'INVALID_PAYMENT_METHOD';
  end if;

  if p_shipping_union_code is null
     or p_shipping_division_code is null
     or p_shipping_district_code is null
     or p_shipping_upazila_code is null
     or p_shipping_division_code !~ '^BD-D[0-9]{2}$'
     or p_shipping_district_code !~ '^BD-D[0-9]{2}-Z[0-9]{2}$'
     or p_shipping_upazila_code !~ '^BD-D[0-9]{2}-Z[0-9]{2}-U[0-9]{3}$'
     or (p_shipping_union_code not in ('not_applicable','other')
         and p_shipping_union_code !~ '^BD-D[0-9]{2}-Z[0-9]{2}-U[0-9]{3}-N[0-9]{4}$')
     or pg_catalog.char_length(pg_catalog.btrim(p_shipping_division)) < 2
     or pg_catalog.char_length(pg_catalog.btrim(p_shipping_district)) < 2
     or pg_catalog.char_length(pg_catalog.btrim(p_shipping_upazila)) < 2
     or pg_catalog.char_length(pg_catalog.btrim(p_shipping_village)) < 2
     or pg_catalog.char_length(pg_catalog.btrim(p_shipping_village)) > 160 then
    raise exception 'INVALID_STRUCTURED_SHIPPING_ADDRESS';
  end if;

  if p_shipping_union_code = 'other' and
     (p_shipping_union_other is null
      or pg_catalog.char_length(pg_catalog.btrim(p_shipping_union_other)) < 2
      or pg_catalog.char_length(pg_catalog.btrim(p_shipping_union_other)) > 120) then
    raise exception 'INVALID_OTHER_SHIPPING_AREA';
  end if;

  if p_payment_method = 'cod' then
    if p_payment_transaction_id is not null then
      raise exception 'COD_PRODUCT_PAYMENT_MUST_BE_EMPTY';
    end if;
    if (v_delivery_method is null) <> (v_delivery_transaction is null) then
      raise exception 'DELIVERY_FEE_PAYMENT_DETAILS_INCOMPLETE';
    end if;
    if v_delivery_method is not null and v_delivery_method not in ('bkash','nagad','rocket') then
      raise exception 'INVALID_DELIVERY_FEE_PAYMENT_METHOD';
    end if;
    if v_delivery_transaction is not null and (
      length(v_delivery_transaction) > 120 or
      v_delivery_transaction !~ '^[A-Za-z0-9-]+$'
    ) then
      raise exception 'INVALID_DELIVERY_FEE_TRANSACTION';
    end if;
  else
    if coalesce(btrim(p_payment_transaction_id),'') = ''
       or length(btrim(p_payment_transaction_id)) > 120
       or btrim(p_payment_transaction_id) !~ '^[A-Za-z0-9-]+$' then
      raise exception 'PRODUCT_PAYMENT_TRANSACTION_REQUIRED';
    end if;
    if v_delivery_method is not null or v_delivery_transaction is not null then
      raise exception 'DUPLICATE_DELIVERY_FEE_PAYMENT_NOT_ALLOWED';
    end if;
  end if;

  v_order := public.create_order_with_coupon(
    p_customer_name, p_customer_phone, p_customer_email, p_shipping_address,
    p_shipping_city, p_payment_method, p_payment_transaction_id, p_items,
    p_coupon_code, p_customer_id
  );
  v_order_id := (v_order ->> 'id')::uuid;
  v_fee := coalesce((v_order ->> 'delivery_fee')::numeric,0);

  if p_payment_method = 'cod' and v_fee > 0 then
    if v_delivery_method is null or v_delivery_transaction is null then
      raise exception 'DELIVERY_FEE_MFS_REQUIRED';
    end if;

    update public.orders set
      delivery_fee_payment_method = v_delivery_method,
      delivery_fee_payment_transaction_id = v_delivery_transaction,
      delivery_fee_payment_status = 'verification_pending'
    where id = v_order_id;
  else
    update public.orders set
      delivery_fee_payment_method = null,
      delivery_fee_payment_transaction_id = null,
      delivery_fee_payment_status = 'not_required'
    where id = v_order_id;
  end if;

  update public.orders set
    shipping_division_code = p_shipping_division_code,
    shipping_division = pg_catalog.btrim(p_shipping_division),
    shipping_district_code = p_shipping_district_code,
    shipping_district = pg_catalog.btrim(p_shipping_district),
    shipping_upazila_code = p_shipping_upazila_code,
    shipping_upazila = pg_catalog.btrim(p_shipping_upazila),
    shipping_union_code = p_shipping_union_code,
    shipping_union = nullif(pg_catalog.btrim(coalesce(p_shipping_union,'')), ''),
    shipping_union_other = nullif(pg_catalog.btrim(coalesce(p_shipping_union_other,'')), ''),
    shipping_village = pg_catalog.btrim(p_shipping_village),
    shipping_city = pg_catalog.btrim(p_shipping_district)
  where id = v_order_id;

  return v_order || pg_catalog.jsonb_build_object(
    'delivery_fee_payment_status',
    case when p_payment_method = 'cod' and v_fee > 0 then 'verification_pending' else 'not_required' end,
    'shipping_division_code', p_shipping_division_code,
    'shipping_division', pg_catalog.btrim(p_shipping_division),
    'shipping_district_code', p_shipping_district_code,
    'shipping_district', pg_catalog.btrim(p_shipping_district),
    'shipping_upazila_code', p_shipping_upazila_code,
    'shipping_upazila', pg_catalog.btrim(p_shipping_upazila),
    'shipping_union_code', p_shipping_union_code,
    'shipping_union', nullif(pg_catalog.btrim(coalesce(p_shipping_union,'')), ''),
    'shipping_village', pg_catalog.btrim(p_shipping_village)
  );
end;
$function$;

revoke all on function public.create_order_with_prepaid_delivery(
  text,text,text,text,text,text,text,jsonb,text,uuid,text,text,
  text,text,text,text,text,text,text,text,text,text
) from public, anon, authenticated;

grant execute on function public.create_order_with_prepaid_delivery(
  text,text,text,text,text,text,text,jsonb,text,uuid,text,text,
  text,text,text,text,text,text,text,text,text,text
) to service_role;
