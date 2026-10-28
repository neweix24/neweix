-- Checkout schema and server-side order functions.
-- Mobile-transfer orders reserve stock while awaiting manual verification.
-- Unverified mobile-transfer orders expire after 24 hours; stock is restored.

begin;

alter table public.products
  add column if not exists compare_at_price integer,
  add column if not exists image_urls text[] not null default '{}',
  add column if not exists video_url text,
  add column if not exists category_id uuid,
  add column if not exists variants jsonb not null default '[]'::jsonb,
  add column if not exists sku text,
  add column if not exists is_featured boolean not null default false,
  add column if not exists low_stock_threshold integer not null default 5,
  add column if not exists updated_at timestamptz not null default now();

alter table public.orders
  add column if not exists customer_email text,
  add column if not exists shipping_city text,
  add column if not exists payment_method text not null default 'cod',
  add column if not exists payment_status text not null default 'pending',
  add column if not exists payment_transaction_id text,
  add column if not exists payment_verified_at timestamptz,
  add column if not exists payment_verified_by uuid references auth.users(id),
  add column if not exists admin_approved_at timestamptz,
  add column if not exists admin_approved_by uuid references auth.users(id),
  add column if not exists delivery_provider text,
  add column if not exists delivery_status text not null default 'not_booked',
  add column if not exists delivery_consignment_id text,
  add column if not exists delivery_tracking_code text,
  add column if not exists delivery_booked_at timestamptz,
  add column if not exists delivery_error text;

-- Preserve legacy catalogue media while adding the columns used by the app.
update public.products
set image_urls = images
where coalesce(cardinality(image_urls), 0) = 0
  and coalesce(cardinality(images), 0) > 0;

update public.products
set video_url = youtube_url
where video_url is null
  and youtube_url is not null;

create unique index if not exists products_sku_normalized_uidx
  on public.products (lower(btrim(sku)))
  where sku is not null and btrim(sku) <> '';

create index if not exists orders_payment_transaction_id_normalized_idx
  on public.orders (lower(btrim(payment_transaction_id)))
  where payment_transaction_id is not null and btrim(payment_transaction_id) <> '';

create or replace function public.set_products_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$function$;

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
before update on public.products
for each row execute function public.set_products_updated_at();

create or replace function public.create_order_with_payment(
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text,
  p_shipping_address text,
  p_shipping_city text,
  p_payment_method text,
  p_payment_transaction_id text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_item record;
  v_product record;
  v_order public.orders%rowtype;
  v_order_number text;
  v_transaction_id text;
  v_item_count integer;
  v_subtotal bigint := 0;
  v_item_snapshots jsonb := '[]'::jsonb;
begin
  if p_customer_name is null or pg_catalog.btrim(p_customer_name) = ''
     or pg_catalog.char_length(pg_catalog.btrim(p_customer_name)) > 120
     or p_customer_phone is null or pg_catalog.btrim(p_customer_phone) = ''
     or pg_catalog.char_length(pg_catalog.btrim(p_customer_phone)) > 30
     or p_shipping_address is null or pg_catalog.btrim(p_shipping_address) = ''
     or pg_catalog.char_length(pg_catalog.btrim(p_shipping_address)) > 1000 then
    raise exception 'Invalid customer or shipping details';
  end if;

  if p_payment_method is null
     or p_payment_method not in ('cod', 'bkash', 'nagad', 'rocket') then
    raise exception 'Invalid payment method';
  end if;

  v_transaction_id := nullif(pg_catalog.btrim(p_payment_transaction_id), '');
  if p_payment_method = 'cod' then
    if v_transaction_id is not null then
      raise exception 'COD does not accept a payment transaction ID';
    end if;
  elsif v_transaction_id is null
     or pg_catalog.char_length(v_transaction_id) > 120
     or v_transaction_id !~ '^[A-Za-z0-9-]+$' then
    raise exception 'Payment transaction ID is required and must be valid';
  end if;

  if v_transaction_id is not null then
    -- Serialize duplicate transaction checks without failing migration on legacy duplicates.
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(pg_catalog.lower(v_transaction_id), 0)
    );

    if exists (
      select 1
      from public.orders as existing_order
      where pg_catalog.lower(pg_catalog.btrim(existing_order.payment_transaction_id))
        = pg_catalog.lower(v_transaction_id)
    ) then
      raise exception using
        errcode = '23505',
        message = 'duplicate key value violates unique constraint orders_payment_transaction_id_normalized_uidx',
        constraint = 'orders_payment_transaction_id_normalized_uidx';
    end if;
  end if;

  if p_items is null or pg_catalog.jsonb_typeof(p_items) <> 'array' then
    raise exception 'Invalid order items';
  end if;

  select pg_catalog.count(*)::integer
    into v_item_count
  from pg_catalog.jsonb_array_elements(p_items);

  if v_item_count < 1 or v_item_count > 50 then
    raise exception 'Invalid order items';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_to_recordset(p_items)
      as parsed(product_id uuid, quantity integer)
    where parsed.product_id is null
       or parsed.quantity is null
       or parsed.quantity < 1
       or parsed.quantity > 100
  ) then
    raise exception 'Invalid order item';
  end if;

  if exists (
    select parsed.product_id
    from pg_catalog.jsonb_to_recordset(p_items)
      as parsed(product_id uuid, quantity integer)
    group by parsed.product_id
    having pg_catalog.count(*) > 1
  ) then
    raise exception 'Duplicate product in order';
  end if;

  -- Lock products in a stable order so concurrent multi-item orders do not deadlock.
  for v_item in
    select parsed.product_id, parsed.quantity
    from pg_catalog.jsonb_to_recordset(p_items)
      as parsed(product_id uuid, quantity integer)
    order by parsed.product_id
  loop
    select p.id, p.name, p.price, p.stock
      into v_product
    from public.products as p
    where p.id = v_item.product_id
      and p.is_active is true
    for update;

    if not found then
      raise exception 'Product unavailable';
    end if;

    if v_product.stock < v_item.quantity then
      raise exception 'Insufficient stock';
    end if;

    update public.products
      set stock = stock - v_item.quantity
    where id = v_product.id;

    v_subtotal := v_subtotal + v_product.price::bigint * v_item.quantity::bigint;
    if v_subtotal > 2147483647 then
      raise exception 'Order total exceeds the supported limit';
    end if;

    v_item_snapshots := v_item_snapshots || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'product_id', v_product.id,
        'product_name_snapshot', v_product.name,
        'unit_price', v_product.price,
        'quantity', v_item.quantity
      )
    );
  end loop;

  v_order_number := 'NW-' || pg_catalog.upper(pg_catalog.gen_random_uuid()::text);

  insert into public.orders (
    order_number,
    customer_email,
    customer_name,
    phone,
    address,
    shipping_city,
    status,
    payment_method,
    payment_transaction_id,
    payment_status,
    subtotal,
    delivery_fee,
    total
  ) values (
    v_order_number,
    nullif(pg_catalog.btrim(p_customer_email), ''),
    pg_catalog.btrim(p_customer_name),
    pg_catalog.btrim(p_customer_phone),
    pg_catalog.btrim(p_shipping_address),
    nullif(pg_catalog.btrim(p_shipping_city), ''),
    'pending',
    p_payment_method,
    v_transaction_id,
    case when p_payment_method = 'cod' then 'pending' else 'verification_pending' end,
    v_subtotal::integer,
    0,
    v_subtotal::integer
  ) returning * into v_order;

  insert into public.order_items (
    order_id,
    product_id,
    product_name_snapshot,
    unit_price,
    quantity
  )
  select
    v_order.id,
    (item.value ->> 'product_id')::uuid,
    item.value ->> 'product_name_snapshot',
    (item.value ->> 'unit_price')::integer,
    (item.value ->> 'quantity')::integer
  from pg_catalog.jsonb_array_elements(v_item_snapshots) as item(value);

  return pg_catalog.to_jsonb(v_order);
end;
$function$;

create or replace function public.expire_unpaid_mobile_orders()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_order record;
  v_expired_count integer := 0;
begin
  for v_order in
    update public.orders
      set status = 'cancelled',
          payment_status = 'failed',
          delivery_status = 'cancelled'
    where payment_method in ('bkash', 'nagad', 'rocket')
      and payment_status = 'verification_pending'
      and status = 'pending'
      and created_at <= pg_catalog.now() - interval '24 hours'
    returning id
  loop
    update public.products as p
      set stock = p.stock + item_totals.quantity
    from (
      select oi.product_id, pg_catalog.sum(oi.quantity)::integer as quantity
      from public.order_items as oi
      where oi.order_id = v_order.id
        and oi.product_id is not null
      group by oi.product_id
    ) as item_totals
    where p.id = item_totals.product_id;

    v_expired_count := v_expired_count + 1;
  end loop;

  return v_expired_count;
end;
$function$;

revoke all on function public.set_products_updated_at() from public, anon, authenticated;
revoke all on function public.create_order_with_payment(text, text, text, text, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.expire_unpaid_mobile_orders() from public, anon, authenticated;
grant execute on function public.create_order_with_payment(text, text, text, text, text, text, text, jsonb) to service_role;
grant execute on function public.expire_unpaid_mobile_orders() to service_role;

commit;
