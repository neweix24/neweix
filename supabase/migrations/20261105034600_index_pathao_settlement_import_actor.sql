-- Cover the imported_by foreign key for efficient audit lookups.
create index if not exists pathao_settlement_imports_imported_by_idx
  on public.pathao_settlement_imports (imported_by);
