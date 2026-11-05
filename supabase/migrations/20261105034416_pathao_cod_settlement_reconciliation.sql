-- Persistent Pathao COD reconciliation imports.
-- Access is server-only through the authenticated Supreme/Admin API.
begin;

create table if not exists public.pathao_settlement_imports (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'pathao' check (provider = 'pathao'),
  settlement_reference text,
  settlement_date date,
  source_filename text not null,
  imported_by uuid not null references auth.users(id),
  row_count integer not null default 0 check (row_count between 0 and 1000),
  matched_count integer not null default 0 check (matched_count between 0 and 1000),
  mismatch_count integer not null default 0 check (mismatch_count between 0 and 1000),
  unmatched_count integer not null default 0 check (unmatched_count between 0 and 1000),
  imported_at timestamptz not null default now(),
  notes text,
  constraint pathao_settlement_reference_length check (settlement_reference is null or char_length(settlement_reference) between 1 and 120),
  constraint pathao_settlement_filename_length check (char_length(source_filename) between 1 and 255)
);

create unique index if not exists pathao_settlement_imports_reference_uidx
  on public.pathao_settlement_imports (settlement_reference)
  where settlement_reference is not null;
create index if not exists pathao_settlement_imports_imported_by_idx
  on public.pathao_settlement_imports (imported_by);

create table if not exists public.pathao_settlement_rows (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.pathao_settlement_imports(id) on delete restrict,
  source_row_number integer not null check (source_row_number between 1 and 1001),
  source_identifier text not null check (char_length(source_identifier) between 1 and 120),
  consignment_id text,
  merchant_order_id text,
  cod_amount numeric(12,2) not null check (cod_amount >= 0),
  delivery_charge numeric(12,2) check (delivery_charge is null or delivery_charge >= 0),
  discount_amount numeric(12,2) check (discount_amount is null or discount_amount >= 0),
  net_payout_amount numeric(12,2) check (net_payout_amount is null or net_payout_amount >= 0),
  expected_cod_amount numeric(12,2),
  variance_amount numeric(12,2),
  matched_order_id uuid references public.orders(id) on delete set null,
  match_status text not null check (match_status in ('matched','amount_mismatch','unmatched','duplicate')),
  raw_row jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (import_id, source_row_number)
);

create index if not exists pathao_settlement_rows_import_idx on public.pathao_settlement_rows (import_id, source_row_number);
create index if not exists pathao_settlement_rows_order_idx on public.pathao_settlement_rows (matched_order_id) where matched_order_id is not null;
create index if not exists pathao_settlement_rows_identifier_idx on public.pathao_settlement_rows (source_identifier);

alter table public.pathao_settlement_imports enable row level security;
alter table public.pathao_settlement_rows enable row level security;
revoke all on public.pathao_settlement_imports from public, anon, authenticated;
revoke all on public.pathao_settlement_rows from public, anon, authenticated;
grant all on public.pathao_settlement_imports to service_role;
grant all on public.pathao_settlement_rows to service_role;

commit;
