begin;

-- Preserve the courier's final booked fee separately from the customer-facing
-- delivery_fee and the checkout-time Pathao estimate.
alter table public.orders
  add column if not exists pathao_actual_fee integer,
  add column if not exists pathao_actual_fee_recorded_at timestamptz;

alter table public.orders
  add constraint orders_pathao_actual_fee_nonnegative
  check (pathao_actual_fee is null or pathao_actual_fee >= 0)
  not valid;

commit;
