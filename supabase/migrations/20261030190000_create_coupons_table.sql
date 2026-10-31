-- Restore the coupon table in fresh local installations.
-- Production already has this table; IF NOT EXISTS keeps this migration safe there.
create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  discount_type text not null
    check (discount_type in ('percentage','fixed','free_shipping')),
  discount_value integer not null default 0 check (discount_value >= 0),
  min_subtotal integer not null default 0 check (min_subtotal >= 0),
  max_discount integer check (max_discount is null or max_discount >= 0),
  starts_at timestamptz,
  expires_at timestamptz,
  usage_limit integer check (usage_limit is null or usage_limit >= 1),
  usage_count integer not null default 0 check (usage_count >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coupons_code_format
    check (code = upper(btrim(code)) and code ~ '^[A-Z0-9_-]{3,40}$'),
  constraint coupons_date_range
    check (expires_at is null or starts_at is null or expires_at > starts_at),
  constraint coupons_free_shipping_value
    check (discount_type <> 'free_shipping' or discount_value = 0),
  constraint coupons_percentage_range
    check (discount_type <> 'percentage' or (discount_value >= 1 and discount_value <= 100))
);

create unique index if not exists coupons_code_uidx
  on public.coupons(code);

create index if not exists coupons_active_window_idx
  on public.coupons(is_active, starts_at, expires_at);

alter table public.coupons enable row level security;
