-- NEWEIX-operated delivery starts in Mymensingh district only.
-- Every Mymensingh upazila is registered, but disabled until its real delivery
-- fee is configured and an administrator explicitly activates it.
begin;

create table if not exists public.neweix_delivery_zones (
  id uuid primary key default gen_random_uuid(),
  zone_code text not null unique,
  division_code text not null,
  division_name text not null,
  district_code text not null,
  district_name text not null,
  upazila_code text not null unique,
  upazila_name text not null,
  upazila_name_bn text not null,
  delivery_fee integer,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint neweix_delivery_zone_code_format check (zone_code ~ '^[A-Z0-9_-]{2,40}$'),
  constraint neweix_delivery_zone_division_format check (division_code ~ '^BD-D[0-9]{2}$'),
  constraint neweix_delivery_zone_district_format check (district_code ~ '^BD-D[0-9]{2}-Z[0-9]{2}$'),
  constraint neweix_delivery_zone_upazila_format check (upazila_code ~ '^BD-D[0-9]{2}-Z[0-9]{2}-U[0-9]{3}$'),
  constraint neweix_delivery_zone_fee_nonnegative check (delivery_fee is null or delivery_fee >= 0),
  constraint neweix_delivery_zone_active_requires_fee check (not is_active or delivery_fee is not null)
);

insert into public.neweix_delivery_zones (
  zone_code, division_code, division_name, district_code, district_name,
  upazila_code, upazila_name, upazila_name_bn, delivery_fee, is_active
) values
  ('BD-D08-Z62-U462', 'BD-D08', 'Mymensingh', 'BD-D08-Z62', 'Mymensingh', 'BD-D08-Z62-U462', 'Fulbaria', 'ফুলবাড়ীয়া', null, false),
  ('BD-D08-Z62-U463', 'BD-D08', 'Mymensingh', 'BD-D08-Z62', 'Mymensingh', 'BD-D08-Z62-U463', 'Trishal', 'ত্রিশাল', null, false),
  ('BD-D08-Z62-U464', 'BD-D08', 'Mymensingh', 'BD-D08-Z62', 'Mymensingh', 'BD-D08-Z62-U464', 'Bhaluka', 'ভালুকা', null, false),
  ('BD-D08-Z62-U465', 'BD-D08', 'Mymensingh', 'BD-D08-Z62', 'Mymensingh', 'BD-D08-Z62-U465', 'Muktagacha', 'মুক্তাগাছা', null, false),
  ('BD-D08-Z62-U466', 'BD-D08', 'Mymensingh', 'BD-D08-Z62', 'Mymensingh', 'BD-D08-Z62-U466', 'Mymensingh Sadar', 'ময়মনসিংহ সদর', null, false),
  ('BD-D08-Z62-U467', 'BD-D08', 'Mymensingh', 'BD-D08-Z62', 'Mymensingh', 'BD-D08-Z62-U467', 'Dhobaura', 'ধোবাউড়া', null, false),
  ('BD-D08-Z62-U468', 'BD-D08', 'Mymensingh', 'BD-D08-Z62', 'Mymensingh', 'BD-D08-Z62-U468', 'Phulpur', 'ফুলপুর', null, false),
  ('BD-D08-Z62-U469', 'BD-D08', 'Mymensingh', 'BD-D08-Z62', 'Mymensingh', 'BD-D08-Z62-U469', 'Haluaghat', 'হালুয়াঘাট', null, false),
  ('BD-D08-Z62-U470', 'BD-D08', 'Mymensingh', 'BD-D08-Z62', 'Mymensingh', 'BD-D08-Z62-U470', 'Gouripur', 'গৌরীপুর', null, false),
  ('BD-D08-Z62-U471', 'BD-D08', 'Mymensingh', 'BD-D08-Z62', 'Mymensingh', 'BD-D08-Z62-U471', 'Gafargaon', 'গফরগাঁও', null, false),
  ('BD-D08-Z62-U472', 'BD-D08', 'Mymensingh', 'BD-D08-Z62', 'Mymensingh', 'BD-D08-Z62-U472', 'Iswarganj', 'ঈশ্বরগঞ্জ', null, false),
  ('BD-D08-Z62-U473', 'BD-D08', 'Mymensingh', 'BD-D08-Z62', 'Mymensingh', 'BD-D08-Z62-U473', 'Nandail', 'নান্দাইল', null, false),
  ('BD-D08-Z62-U474', 'BD-D08', 'Mymensingh', 'BD-D08-Z62', 'Mymensingh', 'BD-D08-Z62-U474', 'Tarakanda', 'তারাকান্দা', null, false)
on conflict (upazila_code) do nothing;

alter table public.neweix_delivery_zones enable row level security;
revoke all on public.neweix_delivery_zones from public, anon, authenticated;
grant select, insert, update, delete on public.neweix_delivery_zones to service_role;

alter table public.orders
  add column if not exists neweix_delivery_zone_id uuid
    references public.neweix_delivery_zones(id) on delete set null,
  add column if not exists neweix_delivery_quote_at timestamptz;

alter table public.orders drop constraint if exists orders_delivery_provider_check;
alter table public.orders
  add constraint orders_delivery_provider_check
  check (delivery_provider is null or delivery_provider in ('pathao', 'manual', 'neweix_own')) not valid;

alter table public.order_fulfillments drop constraint if exists order_fulfillments_provider_check;
alter table public.order_fulfillments
  add constraint order_fulfillments_provider_check
  check (delivery_provider is null or delivery_provider in ('pathao', 'manual', 'neweix_own'));

create or replace function public.create_order_with_neweix_delivery(
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
  p_own_delivery_zone_id uuid
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
  v_zone record;
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

  if p_own_delivery_zone_id is null then raise exception 'NEWEIX_DELIVERY_ZONE_REQUIRED'; end if;

  select id, delivery_fee into v_zone
    from public.neweix_delivery_zones
   where id = p_own_delivery_zone_id
     and division_code = p_shipping_division_code
     and district_code = p_shipping_district_code
     and upazila_code = p_shipping_upazila_code
     and is_active = true
     and delivery_fee is not null
   for share;
  if not found then raise exception 'NEWEIX_DELIVERY_ZONE_NOT_AVAILABLE'; end if;

  if p_payment_method = 'cod' then
    if p_payment_transaction_id is not null then raise exception 'COD_PRODUCT_PAYMENT_MUST_BE_EMPTY'; end if;
    if (v_delivery_method is null) <> (v_delivery_transaction is null) then
      raise exception 'DELIVERY_FEE_PAYMENT_DETAILS_INCOMPLETE';
    end if;
    if v_delivery_method is not null and v_delivery_method not in ('bkash','nagad','rocket') then
      raise exception 'INVALID_DELIVERY_FEE_PAYMENT_METHOD';
    end if;
    if v_delivery_transaction is not null and (
      pg_catalog.length(v_delivery_transaction) > 120 or v_delivery_transaction !~ '^[A-Za-z0-9-]+$'
    ) then raise exception 'INVALID_DELIVERY_FEE_TRANSACTION'; end if;
  else
    if coalesce(pg_catalog.btrim(p_payment_transaction_id),'') = ''
       or pg_catalog.length(pg_catalog.btrim(p_payment_transaction_id)) > 120
       or pg_catalog.btrim(p_payment_transaction_id) !~ '^[A-Za-z0-9-]+$' then
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
  v_fee := case when v_generic_fee = 0 then 0 else v_zone.delivery_fee end;
  v_total := greatest(0, v_subtotal + v_fee - v_discount);

  if p_payment_method = 'cod' and v_fee > 0 then
    if v_delivery_method is null or v_delivery_transaction is null then raise exception 'DELIVERY_FEE_MFS_REQUIRED'; end if;
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
    delivery_provider = 'neweix_own',
    delivery_status = 'pending_approval',
    neweix_delivery_zone_id = v_zone.id,
    neweix_delivery_quote_at = pg_catalog.now(),
    delivery_error = null,
    pathao_estimated_fee = null,
    pathao_city_id = null,
    pathao_zone_id = null,
    pathao_location_mapping_id = null,
    pathao_quote_at = null,
    pathao_area_id = null,
    pathao_area_name = null,
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
    'delivery_provider', 'neweix_own',
    'delivery_status', 'pending_approval',
    'delivery_fee', v_fee,
    'neweix_delivery_zone_id', v_zone.id,
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

revoke all on function public.create_order_with_neweix_delivery(
  text,text,text,text,text,text,text,jsonb,text,uuid,text,text,
  text,text,text,text,text,text,text,text,text,text,uuid
) from public, anon, authenticated;
grant execute on function public.create_order_with_neweix_delivery(
  text,text,text,text,text,text,text,jsonb,text,uuid,text,text,
  text,text,text,text,text,text,text,text,text,text,uuid
) to service_role;

comment on table public.neweix_delivery_zones is
  'Admin-configured NEWEIX-operated delivery zones. A zone is unavailable until an explicit fee is configured and the zone is activated.';

commit;
