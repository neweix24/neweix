-- Record a manually verified bank/MFS receipt against imported Pathao payout totals.
begin;
alter table public.pathao_settlement_imports
  add column if not exists expected_payout_amount numeric(12,2),
  add column if not exists actual_received_amount numeric(12,2),
  add column if not exists payout_variance numeric(12,2),
  add column if not exists receipt_reference text,
  add column if not exists received_at timestamptz,
  add column if not exists received_by uuid references auth.users(id),
  add column if not exists reconciliation_status text not null default 'pending';

alter table public.pathao_settlement_imports
  drop constraint if exists pathao_settlement_reconciliation_status_check;
alter table public.pathao_settlement_imports
  add constraint pathao_settlement_reconciliation_status_check
  check (reconciliation_status in ('pending','reconciled','variance'));

alter table public.pathao_settlement_imports
  drop constraint if exists pathao_settlement_receipt_amount_check;
alter table public.pathao_settlement_imports
  add constraint pathao_settlement_receipt_amount_check
  check (actual_received_amount is null or actual_received_amount >= 0);

alter table public.pathao_settlement_imports
  drop constraint if exists pathao_settlement_receipt_reference_check;
alter table public.pathao_settlement_imports
  add constraint pathao_settlement_receipt_reference_check
  check (receipt_reference is null or char_length(receipt_reference) between 1 and 120);
commit;
