-- Enforce one Pathao consignment ID per order to make webhook/manual sync unambiguous.
drop index if exists public.orders_pathao_consignment_idx;

create unique index orders_pathao_consignment_idx
  on public.orders (delivery_consignment_id)
  where delivery_provider = 'pathao'
    and delivery_consignment_id is not null;
