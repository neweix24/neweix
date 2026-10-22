-- Neweix initial database schema
create extension if not exists pgcrypto;

create type public.order_status as enum (
  'pending',
  'confirmed',
  'packing',
  'shipped',
  'delivered',
  'cancelled'
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text not null default '',
  price integer not null check (price >= 0),
  stock integer not null default 0 check (stock >= 0),
  images text[] not null default '{}',
  youtube_url text,
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.customer_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  phone text,
  created_at timestamptz not null default now()
);

create table public.staff_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role text not null check (role in ('admin', 'supreme')),
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text unique not null,
  customer_user_id uuid references auth.users(id) on delete set null,
  customer_name text not null,
  phone text not null,
  address text not null,
  status public.order_status not null default 'pending',
  subtotal integer not null check (subtotal >= 0),
  delivery_fee integer not null default 0 check (delivery_fee >= 0),
  total integer not null check (total = subtotal + delivery_fee),
  created_at timestamptz not null default now()
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name_snapshot text not null,
  unit_price integer not null check (unit_price >= 0),
  quantity integer not null check (quantity > 0)
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- Enable Row Level Security
alter table public.products enable row level security;
alter table public.customer_profiles enable row level security;
alter table public.staff_profiles enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.audit_logs enable row level security;

-- Public can only read active products
create policy "Anyone can read active products"
on public.products
for select
to anon, authenticated
using (is_active = true);

-- Customers can access their own profile
create policy "Customers read own profile"
on public.customer_profiles
for select
to authenticated
using (auth.uid() = user_id);

create policy "Customers insert own profile"
on public.customer_profiles
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Customers update own profile"
on public.customer_profiles
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- No client permissions for staff, orders, or audit logs yet.
-- Add reviewed server-side authorization before production.