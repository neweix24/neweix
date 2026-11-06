-- Persist the verified Pathao Area selected by the customer alongside the live quote.
-- Pathao still calculates its live fee by City + Zone; Area is validated for serviceability.
-- Customer delivery_fee may be zero due to a free-delivery threshold or coupon,
-- while pathao_estimated_fee remains the courier's quoted cost.
begin;

alter table public.orders
  add column if not exists pathao_estimated_fee integer,
  add column if not exists pathao_city_id integer,
  add column if not exists pathao_zone_id integer,
  add column if not exists pathao_location_mapping_id uuid
    references public.pathao_location_mappings(id) on delete set null,
  add column if not exists pathao_area_id integer,
  add column if not exists pathao_area_name text,
  add column if not exists pathao_quote_at timestamptz;

alter table public.orders
  drop constraint if exists orders_pathao_estimated_fee_check;
alter table public.orders
  add constraint orders_pathao_estimated_fee_check
  check (pathao_estimated_fee is null or pathao_estimated_fee >= 0) not valid;

alter table public.orders
  drop constraint if exists orders_pathao_area_id_check;
alter table public.orders
  add constraint orders_pathao_area_id_check
  check (pathao_area_id is null or pathao_area_id > 0) not valid;

drop function if exists public.create_order_with_prepaid_delivery(text,text,text,text,text,text,text,jsonb,text,uuid,text,text,text,text,text,text,text,text,text,text,text,text,integer,integer,integer,uuid,integer,text);

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
  p_shipping_village text,
  p_pathao_delivery_fee integer,
  p_pathao_city_id integer,
  p_pathao_zone_id integer,
  p_pathao_location_mapping_id uuid,
  p_pathao_area_id integer,
  p_pathao_area_name text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_order jsonb;
  v_order_id uuid;
  v_generic_fee numeric;
  v_fee numeric;
  v_subtotal numeric;
  v_discount numeric;
  v_total numeric;
  v_delivery_method text := nullif(pg_catalog.btrim(p_delivery_fee_payment_method), '');
  v_delivery_transaction text := nullif(pg_catalog.btrim(p_delivery_fee_payment_transaction_id), '');
  v_mapping record;
  v_area record;
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
     or p_shipping_upazila is null
     or pg_catalog.char_length(pg_catalog.btrim(p_shipping_upazila)) < 2
     or pg_catalog.char_length(pg_catalog.btrim(p_shipping_upazila)) > 120
     or (p_shipping_union_code not in ('not_applicable','other')
         and p_shipping_union_code !~ '^BD-D[0-9]{2}-Z[0-9]{2}-U[0-9]{3}-N[0-9]{4}$')
     or pg_catalog.char_length(pg_catalog.btrim(p_shipping_division)) < 2
     or pg_catalog.char_length(pg_catalog.btrim(p_shipping_district)) < 2
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

  if p_pathao_delivery_fee is null or p_pathao_delivery_fee < 0
     or p_pathao_city_id is null or p_pathao_city_id < 1
     or p_pathao_zone_id is null or p_pathao_zone_id < 1
     or p_pathao_location_mapping_id is null then
    raise exception 'INVALID_PATHAO_QUOTE';
  end if;

  select id, pathao_city_id, pathao_zone_id
    into v_mapping
    from public.pathao_location_mappings
   where id = p_pathao_location_mapping_id
     and division_code = p_shipping_division_code
     and district_code = p_shipping_district_code
     and upazila_code = p_shipping_upazila_code
     and pathao_city_id = p_pathao_city_id
     and pathao_zone_id = p_pathao_zone_id
     and is_verified = true
     and is_active = true
   for share;
  if not found then raise exception 'PATHAO_LOCATION_MAPPING_NOT_VERIFIED'; end if;

  if p_pathao_area_id is null or p_pathao_area_id < 1
     or p_pathao_area_name is null
     or pg_catalog.char_length(pg_catalog.btrim(p_pathao_area_name)) < 1
     or pg_catalog.char_length(pg_catalog.btrim(p_pathao_area_name)) > 160 then
    raise exception 'INVALID_PATHAO_AREA';
  end if;

  select pathao_area_id, pathao_area_name
    into v_area
    from public.pathao_area_catalog
   where pathao_city_id = p_pathao_city_id
     and pathao_zone_id = p_pathao_zone_id
     and pathao_area_id = p_pathao_area_id
     and pg_catalog.lower(pathao_area_name) = pg_catalog.lower(pg_catalog.btrim(p_pathao_area_name))
     and is_active = true
     and home_delivery_available = true
   for share;
  if not found then raise exception 'PATHAO_AREA_NOT_AVAILABLE'; end if;

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
  v_generic_fee := coalesce((v_order ->> 'delivery_fee')::numeric, 0);
  v_subtotal := coalesce((v_order ->> 'subtotal')::numeric, 0);
  v_discount := coalesce((v_order ->> 'discount')::numeric, 0);

  -- A zero fee from the existing pricing function means the free-delivery
  -- threshold or free-shipping coupon was applied. Preserve that benefit.
  v_fee := case when v_generic_fee = 0 then 0 else p_pathao_delivery_fee end;
  v_total := greatest(0, v_subtotal + v_fee - v_discount);

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
    subtotal = v_subtotal,
    delivery_fee = v_fee,
    total = v_total,
    pathao_estimated_fee = p_pathao_delivery_fee,
    pathao_city_id = p_pathao_city_id,
    pathao_zone_id = p_pathao_zone_id,
    pathao_location_mapping_id = p_pathao_location_mapping_id,
    pathao_area_id = p_pathao_area_id,
    pathao_area_name = pg_catalog.btrim(p_pathao_area_name),
    pathao_quote_at = pg_catalog.now(),
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
    'delivery_fee', v_fee,
    'pathao_estimated_fee', p_pathao_delivery_fee,
    'pathao_area_id', p_pathao_area_id,
    'pathao_area_name', pg_catalog.btrim(p_pathao_area_name),
    'total', v_total,
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

revoke all on function public.create_order_with_prepaid_delivery(text,text,text,text,text,text,text,jsonb,text,uuid,text,text,text,text,text,text,text,text,text,text,text,text,integer,integer,integer,uuid,integer,text
) from public, anon, authenticated;
grant execute on function public.create_order_with_prepaid_delivery(text,text,text,text,text,text,text,jsonb,text,uuid,text,text,text,text,text,text,text,text,text,text,text,text,integer,integer,integer,uuid,integer,text
) to service_role;

commit;
