-- NEWEIX 004: bring the database in line with what the application code uses.
-- Safe to run more than once (idempotent). Review before running on live data.

begin;

-- ---------- categories ----------
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.categories enable row level security;
drop policy if exists "Anyone can read active categories" on public.categories;
create policy "Anyone can read active categories" on public.categories
  for select to anon, authenticated using (is_active = true);

-- ---------- products ----------
alter table public.products
  add column if not exists compare_at_price integer,
  add column if not exists image_urls text[] not null default '{}',
  add column if not exists video_url text,
  add column if not exists category_id uuid references public.categories(id) on delete set null,
  add column if not exists variants jsonb not null default '[]'::jsonb,
  add column if not exists sku text,
  add column if not exists is_featured boolean not null default false,
  add column if not exists low_stock_threshold integer not null default 5,
  add column if not exists updated_at timestamptz not null default now();

-- carry over data from the old column names, if they still exist
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='products' and column_name='images') then
    update public.products set image_urls = images
      where image_urls = '{}' and images <> '{}';
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='products' and column_name='youtube_url') then
    update public.products set video_url = youtube_url
      where video_url is null and youtube_url is not null;
  end if;
end $$;

alter table public.products drop constraint if exists products_compare_at_price_check;
alter table public.products add constraint products_compare_at_price_check
  check (compare_at_price is null or compare_at_price >= 0) not valid;
alter table public.products drop constraint if exists products_low_stock_threshold_check;
alter table public.products add constraint products_low_stock_threshold_check
  check (low_stock_threshold >= 0) not valid;

create unique index if not exists products_sku_uidx
  on public.products (lower(sku)) where sku is not null;

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end $$;

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at before update on public.products
  for each row execute function public.set_updated_at();

-- ---------- staff_profiles: code creates 'staff' users without display_name ----------
alter table public.staff_profiles alter column display_name drop not null;
alter table public.staff_profiles drop constraint if exists staff_profiles_role_check;
alter table public.staff_profiles add constraint staff_profiles_role_check
  check (role in ('staff', 'admin', 'supreme'));

-- Staff may read ONLY their own profile (middleware/auth use the user session).
drop policy if exists "Staff read own profile" on public.staff_profiles;
create policy "Staff read own profile" on public.staff_profiles
  for select to authenticated using (auth.uid() = user_id);

-- ---------- customer_profiles: account page uses full_name ----------
alter table public.customer_profiles add column if not exists full_name text;
update public.customer_profiles set full_name = display_name
  where full_name is null and display_name is not null;

-- ---------- customer_theme_settings ----------
create table if not exists public.customer_theme_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  theme jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.customer_theme_settings enable row level security;
drop policy if exists "Customers read own theme" on public.customer_theme_settings;
drop policy if exists "Customers insert own theme" on public.customer_theme_settings;
drop policy if exists "Customers update own theme" on public.customer_theme_settings;
create policy "Customers read own theme" on public.customer_theme_settings
  for select to authenticated using (auth.uid() = user_id);
create policy "Customers insert own theme" on public.customer_theme_settings
  for insert to authenticated with check (auth.uid() = user_id);
create policy "Customers update own theme" on public.customer_theme_settings
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- product_submissions (staff propose, admin approves) ----------
create table if not exists public.product_submissions (
  id uuid primary key default gen_random_uuid(),
  submitted_by uuid not null references auth.users(id) on delete cascade,
  product_data jsonb not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  review_note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_product_id uuid references public.products(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.product_submissions enable row level security; -- server (service role) only
drop trigger if exists product_submissions_set_updated_at on public.product_submissions;
create trigger product_submissions_set_updated_at before update on public.product_submissions
  for each row execute function public.set_updated_at();

-- ---------- shop settings (delivery fees; editable later from admin) ----------
create table if not exists public.shop_settings (
  key text primary key,
  value jsonb not null
);
alter table public.shop_settings enable row level security; -- server only
insert into public.shop_settings (key, value) values
  ('delivery_fee_dhaka', '80'::jsonb),
  ('delivery_fee_outside', '130'::jsonb)
on conflict (key) do nothing;

-- ---------- orders: columns the API and tracking page use ----------
alter table public.orders
  add column if not exists customer_phone text,
  add column if not exists customer_email text,
  add column if not exists shipping_address text,
  add column if not exists shipping_city text,
  add column if not exists payment_method text not null default 'cod',
  add column if not exists payment_status text not null default 'pending';

update public.orders set customer_phone = phone where customer_phone is null;
update public.orders set shipping_address = address where shipping_address is null;

-- the old columns stay for compatibility but must not block new inserts
alter table public.orders alter column phone drop not null;
alter table public.orders alter column address drop not null;

create unique index if not exists orders_payment_transaction_id_normalized_uidx
  on public.orders (lower(btrim(payment_transaction_id)))
  where payment_transaction_id is not null and payment_method <> 'cod';

create index if not exists orders_tracking_idx
  on public.orders (order_number, customer_phone);

-- ---------- helper: password-account check used by forgot-password ----------
create or replace function public.neweix_has_password_account(p_email text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.users u
    where lower(u.email) = lower(p_email)
      and coalesce(u.encrypted_password, '') <> ''
  );
$$;
revoke all on function public.neweix_has_password_account(text) from public, anon, authenticated;
grant execute on function public.neweix_has_password_account(text) to service_role;

-- ---------- create_order_with_payment ----------
-- Locks product rows, checks stock, prices everything from the database
-- (never from the browser), decrements stock and creates order + items atomically.
create or replace function public.create_order_with_payment(
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text,
  p_shipping_address text,
  p_shipping_city text,
  p_payment_method text,
  p_payment_transaction_id text,
  p_items jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_item record;
  v_product record;
  v_subtotal integer := 0;
  v_fee integer;
  v_order_id uuid;
  v_order_number text;
  v_payment_status text;
  v_city text := lower(btrim(coalesce(p_shipping_city, '')));
begin
  if p_items is null or pg_catalog.jsonb_typeof(p_items) <> 'array'
     or pg_catalog.jsonb_array_length(p_items) = 0 then
    raise exception 'invalid items';
  end if;

  if p_payment_method not in ('cod', 'bkash', 'nagad', 'rocket') then
    raise exception 'invalid payment method';
  end if;

  if p_payment_method <> 'cod' and coalesce(btrim(p_payment_transaction_id), '') = '' then
    raise exception 'payment transaction id required';
  end if;

  v_order_id := pg_catalog.gen_random_uuid();

  -- orders row first (items reference it); totals are fixed up below
  v_order_number := 'NWX-' || upper(substr(replace(pg_catalog.gen_random_uuid()::text, '-', ''), 1, 10));
  v_payment_status := case when p_payment_method = 'cod' then 'pending' else 'verification_pending' end;

  insert into public.orders (
    id, order_number, customer_name, phone, address,
    customer_phone, customer_email, shipping_address, shipping_city,
    payment_method, payment_status, payment_transaction_id,
    subtotal, delivery_fee, total
  ) values (
    v_order_id, v_order_number, p_customer_name, p_customer_phone, p_shipping_address,
    p_customer_phone, p_customer_email, p_shipping_address, p_shipping_city,
    p_payment_method, v_payment_status,
    case when p_payment_method = 'cod' then null else btrim(p_payment_transaction_id) end,
    0, 0, 0
  );

  -- lock products in id order to avoid deadlocks
  for v_item in
    select (e ->> 'product_id')::uuid as product_id,
           (e ->> 'quantity')::integer as quantity
    from pg_catalog.jsonb_array_elements(p_items) e
    order by 1
  loop
    select id, name, price, stock into v_product
    from public.products
    where id = v_item.product_id and is_active = true
    for update;

    if not found then
      raise exception 'product unavailable';
    end if;
    if v_product.stock < v_item.quantity then
      raise exception 'insufficient stock for %', v_product.name;
    end if;

    update public.products set stock = stock - v_item.quantity where id = v_product.id;

    insert into public.order_items (order_id, product_id, product_name_snapshot, unit_price, quantity)
    values (v_order_id, v_product.id, v_product.name, v_product.price, v_item.quantity);

    v_subtotal := v_subtotal + v_product.price * v_item.quantity;
  end loop;

  select coalesce(
           (select (value #>> '{}')::integer from public.shop_settings
            where key = case when v_city ~ '(dhaka|ঢাকা)' then 'delivery_fee_dhaka' else 'delivery_fee_outside' end),
           case when v_city ~ '(dhaka|ঢাকা)' then 80 else 130 end)
    into v_fee;

  update public.orders
     set subtotal = v_subtotal, delivery_fee = v_fee, total = v_subtotal + v_fee
   where id = v_order_id;

  return pg_catalog.jsonb_build_object(
    'id', v_order_id,
    'order_number', v_order_number,
    'status', 'pending',
    'payment_status', v_payment_status,
    'subtotal', v_subtotal,
    'delivery_fee', v_fee,
    'total', v_subtotal + v_fee
  );
end $$;
revoke all on function public.create_order_with_payment(text,text,text,text,text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.create_order_with_payment(text,text,text,text,text,text,text,jsonb) to service_role;

-- ---------- expire_unpaid_mobile_orders ----------
-- Cancels mobile-payment orders that stayed 'pending' (no transaction id verified)
-- for 24h and returns their stock.
create or replace function public.expire_unpaid_mobile_orders()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_order record;
  v_count integer := 0;
begin
  for v_order in
    select id from public.orders
    where payment_method <> 'cod'
      and payment_status = 'pending'
      and status = 'pending'
      and created_at < pg_catalog.now() - interval '24 hours'
    for update skip locked
  loop
    update public.products p set stock = p.stock + oi.quantity
      from public.order_items oi
     where oi.order_id = v_order.id and oi.product_id = p.id;

    update public.orders
       set status = 'cancelled', payment_status = 'failed'
     where id = v_order.id;

    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;
revoke all on function public.expire_unpaid_mobile_orders() from public, anon, authenticated;
grant execute on function public.expire_unpaid_mobile_orders() to service_role;

commit;
