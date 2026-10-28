-- Neweix order automation foundation
-- Adds fields only. Does not create orders, change stock, or book couriers.

begin;

alter table public.orders
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

alter table public.products
  add column if not exists weight_grams integer not null default 500;

alter table public.orders
  drop constraint if exists orders_payment_status_check;

alter table public.orders
  add constraint orders_payment_status_check
  check (
    payment_status in (
      'pending',
      'verification_pending',
      'paid',
      'failed',
      'refunded'
    )
  ) not valid;

alter table public.orders
  drop constraint if exists orders_payment_method_check;

alter table public.orders
  add constraint orders_payment_method_check
  check (
    payment_method in ('cod', 'bkash', 'nagad', 'rocket', 'card')
  ) not valid;

alter table public.orders
  drop constraint if exists orders_delivery_status_check;

alter table public.orders
  add constraint orders_delivery_status_check
  check (
    delivery_status in (
      'not_booked',
      'pending_approval',
      'booking',
      'booked',
      'picked_up',
      'in_transit',
      'delivered',
      'returned',
      'cancelled',
      'failed'
    )
  ) not valid;

alter table public.products
  drop constraint if exists products_weight_grams_check;

alter table public.products
  add constraint products_weight_grams_check
  check (weight_grams > 0) not valid;

create index if not exists orders_payment_status_idx
  on public.orders(payment_status);

create index if not exists orders_delivery_status_idx
  on public.orders(delivery_status);

create index if not exists orders_transaction_id_idx
  on public.orders(payment_transaction_id)
  where payment_transaction_id is not null;

commit;