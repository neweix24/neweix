-- Cover the received_by foreign key for efficient receipt audit lookups.
create index if not exists pathao_settlement_imports_received_by_idx
  on public.pathao_settlement_imports (received_by);
