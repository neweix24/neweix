-- NEWEIX multi-origin fulfillment foundation.
-- Existing products.stock remains authoritative until each product's physical
-- stock is explicitly reconciled into one or more warehouses. Never assume
-- legacy stock is physically located in Mymensingh.
begin;

create table if not exists public.warehouses (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  city text not null,
  district text not null,
  division text not null,
  address text,
  contact_name text,
  contact_phone text,
  pathao_store_id bigint,
  is_primary boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint warehouses_code_format check (code ~ '^[A-Z0-9_-]{2,30}$'),
  constraint warehouses_name_length check (char_length(btrim(name)) between 2 and 120),
  constraint warehouses_city_length check (char_length(btrim(city)) between 2 and 120),
  constraint warehouses_pathao_store_id_positive check (pathao_store_id is null or pathao_store_id > 0)
);

create unique index if not exists warehouses_single_primary_uidx
  on public.warehouses (is_primary) where is_primary = true;
create index if not exists warehouses_active_city_idx
  on public.warehouses (city, district) where is_active = true;

insert into public.warehouses
  (code, name, city, district, division, is_primary, is_active)
values
  ('MYMENSINGH-HQ', 'NEWEIX Mymensingh Headquarters', 'Mymensingh', 'Mymensingh', 'Mymensingh', true, true),
  ('DHAKA-DC', 'NEWEIX Dhaka Dispatch Centre', 'Dhaka', 'Dhaka', 'Dhaka', false, true)
on conflict (code) do nothing;

create table if not exists public.warehouse_inventory (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity_on_hand integer not null default 0 check (quantity_on_hand >= 0),
  quantity_reserved integer not null default 0 check (quantity_reserved >= 0),
  reorder_level integer not null default 0 check (reorder_level >= 0),
  updated_at timestamptz not null default now(),
  constraint warehouse_inventory_reserved_lte_on_hand
    check (quantity_reserved <= quantity_on_hand),
  constraint warehouse_inventory_warehouse_product_unique unique (warehouse_id, product_id)
);
create index if not exists warehouse_inventory_product_idx
  on public.warehouse_inventory (product_id);
create index if not exists warehouse_inventory_available_idx
  on public.warehouse_inventory (warehouse_id, product_id)
  where quantity_on_hand > quantity_reserved;

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  from_warehouse_id uuid references public.warehouses(id) on delete restrict,
  to_warehouse_id uuid references public.warehouses(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  movement_type text not null check (movement_type in ('opening_balance','transfer','adjustment_in','adjustment_out','order_reservation','order_release','order_dispatch','return_restock')),
  reference_type text,
  reference_id uuid,
  note text,
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint inventory_movements_location_required
    check (from_warehouse_id is not null or to_warehouse_id is not null),
  constraint inventory_movements_distinct_locations
    check (from_warehouse_id is null or to_warehouse_id is null or from_warehouse_id <> to_warehouse_id)
);
create index if not exists inventory_movements_product_created_idx
  on public.inventory_movements (product_id, created_at desc);
create index if not exists inventory_movements_reference_idx
  on public.inventory_movements (reference_type, reference_id)
  where reference_id is not null;

create table if not exists public.order_fulfillments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  fulfillment_number text not null unique,
  status text not null default 'pending'
    check (status in ('pending','allocated','packing','ready_to_ship','booked','dispatched','delivered','cancelled','failed')),
  delivery_provider text,
  delivery_consignment_id text,
  delivery_tracking_code text,
  delivery_fee integer check (delivery_fee is null or delivery_fee >= 0),
  pathao_booking_payload jsonb,
  delivery_error text,
  booked_at timestamptz,
  dispatched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint order_fulfillments_provider_check
    check (delivery_provider is null or delivery_provider in ('pathao','manual'))
);
create index if not exists order_fulfillments_order_idx
  on public.order_fulfillments (order_id, created_at);
create index if not exists order_fulfillments_warehouse_status_idx
  on public.order_fulfillments (warehouse_id, status, created_at desc);
create unique index if not exists order_fulfillments_consignment_uidx
  on public.order_fulfillments (delivery_consignment_id)
  where delivery_consignment_id is not null;

create table if not exists public.order_fulfillment_items (
  id uuid primary key default gen_random_uuid(),
  fulfillment_id uuid not null references public.order_fulfillments(id) on delete cascade,
  order_item_id uuid not null references public.order_items(id) on delete restrict,
  product_id uuid references public.products(id) on delete set null,
  product_name_snapshot text not null,
  quantity integer not null check (quantity > 0),
  unit_price integer not null check (unit_price >= 0),
  created_at timestamptz not null default now(),
  constraint order_fulfillment_items_line_unique unique (fulfillment_id, order_item_id)
);
create index if not exists order_fulfillment_items_order_item_idx
  on public.order_fulfillment_items (order_item_id);

alter table public.warehouses enable row level security;
alter table public.warehouse_inventory enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.order_fulfillments enable row level security;
alter table public.order_fulfillment_items enable row level security;

revoke all on table public.warehouses, public.warehouse_inventory,
  public.inventory_movements, public.order_fulfillments,
  public.order_fulfillment_items from public, anon, authenticated;
grant select, insert, update, delete on table public.warehouses,
  public.warehouse_inventory, public.inventory_movements,
  public.order_fulfillments, public.order_fulfillment_items to service_role;

comment on table public.warehouses is
  'NEWEIX dispatch origins. Each warehouse has its own address and optional Pathao store ID.';
comment on table public.warehouse_inventory is
  'Physical stock by product and warehouse. Existing products.stock is not auto-assigned to any warehouse.';
comment on table public.inventory_movements is
  'Auditable stock movement ledger across NEWEIX warehouses.';
comment on table public.order_fulfillments is
  'One or more shipment groups per order, allowing split fulfilment from multiple origins.';
comment on table public.order_fulfillment_items is
  'Order lines allocated to a specific shipment/warehouse.';

commit;
