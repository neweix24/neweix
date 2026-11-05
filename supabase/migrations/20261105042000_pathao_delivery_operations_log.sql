-- Manual audit trail for Pathao return, reverse pickup, exchange and partial-delivery actions.
-- These actions remain merchant-panel operations until Pathao documents supported API mutations.
begin;
create table if not exists public.pathao_delivery_operations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  consignment_id text not null check (char_length(consignment_id) between 3 and 80),
  operation_type text not null check (operation_type in ('reverse_pickup','return','exchange','partial_delivery')),
  operation_status text not null default 'recorded' check (operation_status in ('requested','in_progress','completed','failed','recorded')),
  related_consignment_id text check (related_consignment_id is null or char_length(related_consignment_id) between 3 and 80),
  notes text check (notes is null or char_length(notes) <= 1000),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists pathao_delivery_operations_order_idx
  on public.pathao_delivery_operations (order_id, created_at desc);
create index if not exists pathao_delivery_operations_consignment_idx
  on public.pathao_delivery_operations (consignment_id, created_at desc);
create index if not exists pathao_delivery_operations_actor_idx
  on public.pathao_delivery_operations (created_by);
alter table public.pathao_delivery_operations enable row level security;
revoke all on public.pathao_delivery_operations from public, anon, authenticated;
grant all on public.pathao_delivery_operations to service_role;
commit;
