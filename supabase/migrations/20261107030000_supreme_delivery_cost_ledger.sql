-- Actual courier and NEWEIX-operated delivery cost ledger.
-- Customer delivery_fee and Pathao checkout quotes are revenue/estimates, not actual costs.
-- Existing matched Pathao settlement rows are imported as verified courier charges.
begin;

create table if not exists public.delivery_cost_entries (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  provider text not null check (provider in ('pathao', 'neweix_own')),
  cost_type text not null check (cost_type in (
    'delivery_charge', 'return_charge', 'rider_payment', 'fuel',
    'toll', 'packaging', 'other'
  )),
  entry_kind text not null default 'charge' check (entry_kind in ('charge', 'refund')),
  amount integer not null check (amount > 0 and amount <= 1000000000),
  cost_date date not null,
  source_type text not null check (source_type in (
    'pathao_settlement', 'manual_receipt', 'cashbook', 'other'
  )),
  source_reference text,
  settlement_import_id uuid references public.pathao_settlement_imports(id) on delete restrict,
  settlement_row_id uuid references public.pathao_settlement_rows(id) on delete restrict,
  notes text check (notes is null or char_length(btrim(notes)) <= 1000),
  recorded_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint delivery_cost_provider_source_check check (
    (provider = 'pathao' and source_type = 'pathao_settlement')
    or (provider = 'neweix_own' and source_type in ('manual_receipt', 'cashbook', 'other'))
    or (provider = 'pathao' and source_type in ('manual_receipt', 'cashbook', 'other'))
  ),
  constraint delivery_cost_settlement_link_check check (
    (source_type = 'pathao_settlement' and settlement_import_id is not null and settlement_row_id is not null)
    or (source_type <> 'pathao_settlement' and settlement_import_id is null and settlement_row_id is null)
  ),
  constraint delivery_cost_source_reference_length check (
    source_reference is null or char_length(btrim(source_reference)) between 1 and 160
  )
);

create unique index if not exists delivery_cost_settlement_row_uidx
  on public.delivery_cost_entries(settlement_row_id)
  where settlement_row_id is not null;
create unique index if not exists delivery_cost_manual_reference_uidx
  on public.delivery_cost_entries(provider, source_type, source_reference)
  where source_reference is not null and settlement_row_id is null;
create index if not exists delivery_cost_entries_order_date_idx
  on public.delivery_cost_entries(order_id, cost_date desc);
create index if not exists delivery_cost_entries_provider_date_idx
  on public.delivery_cost_entries(provider, cost_date desc);

alter table public.delivery_cost_entries enable row level security;
revoke all on public.delivery_cost_entries from public, anon, authenticated, service_role;
grant select, insert on public.delivery_cost_entries to service_role;

-- Import previously reconciled Pathao settlement delivery charges once.
-- Rows with no matched order or no actual delivery charge remain unresolved.
insert into public.delivery_cost_entries (
  order_id, provider, cost_type, entry_kind, amount, cost_date,
  source_type, source_reference, settlement_import_id, settlement_row_id,
  notes, recorded_by
)
select
  r.matched_order_id,
  'pathao',
  'delivery_charge',
  'charge',
  r.delivery_charge,
  coalesce(i.settlement_date, i.imported_at::date),
  'pathao_settlement',
  i.id::text || ':' || r.source_row_number::text,
  i.id,
  r.id,
  'Imported from previously reconciled Pathao settlement row.',
  i.imported_by
from public.pathao_settlement_rows r
join public.pathao_settlement_imports i on i.id = r.import_id
where r.matched_order_id is not null
  and r.delivery_charge is not null
  and r.delivery_charge > 0
on conflict (settlement_row_id) where settlement_row_id is not null do nothing;

create or replace function public.supreme_record_delivery_cost(
  p_actor_id uuid,
  p_order_id uuid,
  p_provider text,
  p_cost_type text,
  p_entry_kind text,
  p_amount integer,
  p_cost_date date,
  p_source_type text,
  p_source_reference text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_order_provider text;
  v_entry public.delivery_cost_entries%rowtype;
  v_reference text := nullif(pg_catalog.btrim(p_source_reference), '');
  v_notes text := nullif(pg_catalog.btrim(p_notes), '');
begin
  if not exists (
    select 1 from public.staff_profiles sp
    where sp.user_id = p_actor_id and sp.role = 'supreme' and sp.is_active = true
  ) then
    raise exception 'SUPREME_ACTOR_NOT_AUTHORIZED';
  end if;

  if p_order_id is null or p_provider not in ('pathao', 'neweix_own')
     or p_cost_type not in ('delivery_charge','return_charge','rider_payment','fuel','toll','packaging','other')
     or p_entry_kind not in ('charge','refund')
     or p_amount is null or p_amount <= 0 or p_amount > 1000000000
     or p_cost_date is null
     or p_source_type not in ('manual_receipt','cashbook','other')
     or (v_reference is not null and pg_catalog.char_length(v_reference) > 160)
     or (v_notes is not null and pg_catalog.char_length(v_notes) > 1000) then
    raise exception 'INVALID_DELIVERY_COST_INPUT';
  end if;

  select o.delivery_provider into v_order_provider
  from public.orders o where o.id = p_order_id for share;

  if not found then raise exception 'DELIVERY_COST_ORDER_NOT_FOUND'; end if;
  if v_order_provider is distinct from p_provider then
    raise exception 'DELIVERY_COST_PROVIDER_MISMATCH';
  end if;

  insert into public.delivery_cost_entries (
    order_id, provider, cost_type, entry_kind, amount, cost_date,
    source_type, source_reference, notes, recorded_by
  ) values (
    p_order_id, p_provider, p_cost_type, p_entry_kind, p_amount, p_cost_date,
    p_source_type, v_reference, v_notes, p_actor_id
  )
  returning * into v_entry;

  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values (
    p_actor_id,
    'delivery.cost.recorded',
    'delivery_cost_entry',
    v_entry.id,
    pg_catalog.jsonb_build_object(
      'order_id', p_order_id, 'provider', p_provider, 'cost_type', p_cost_type,
      'entry_kind', p_entry_kind, 'amount', p_amount, 'cost_date', p_cost_date,
      'source_type', p_source_type, 'source_reference', v_reference
    )
  );

  return pg_catalog.jsonb_build_object(
    'id', v_entry.id, 'order_id', v_entry.order_id, 'provider', v_entry.provider,
    'cost_type', v_entry.cost_type, 'entry_kind', v_entry.entry_kind,
    'amount', v_entry.amount, 'cost_date', v_entry.cost_date,
    'source_type', v_entry.source_type, 'source_reference', v_entry.source_reference,
    'notes', v_entry.notes, 'created_at', v_entry.created_at
  );
end;
$function$;

revoke all on function public.supreme_record_delivery_cost(
  uuid,uuid,text,text,text,integer,date,text,text,text
) from public, anon, authenticated, service_role;
grant execute on function public.supreme_record_delivery_cost(
  uuid,uuid,text,text,text,integer,date,text,text,text
) to service_role;

create or replace function public.supreme_delivery_cost_summary(
  p_start_at timestamptz default null,
  p_end_at timestamptz default null
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  with entries as (
    select provider, cost_type, entry_kind, amount
    from public.delivery_cost_entries
    where (p_start_at is null or cost_date >= (p_start_at at time zone 'Asia/Dhaka')::date)
      and (p_end_at is null or cost_date < (p_end_at at time zone 'Asia/Dhaka')::date
        + case when (p_end_at at time zone 'Asia/Dhaka')::time = time '00:00:00' then 0 else 1 end)
  ),
  totals as (
    select
      coalesce(sum(case when provider = 'pathao' and entry_kind = 'charge' then amount
                        when provider = 'pathao' and entry_kind = 'refund' then -amount else 0 end),0)::bigint as pathao_cost,
      coalesce(sum(case when provider = 'neweix_own' and entry_kind = 'charge' then amount
                        when provider = 'neweix_own' and entry_kind = 'refund' then -amount else 0 end),0)::bigint as own_delivery_cost,
      coalesce(sum(case when entry_kind = 'charge' then amount else -amount end),0)::bigint as total_cost,
      count(*)::bigint as entry_count
    from entries
  )
  select pg_catalog.jsonb_build_object(
    'pathao_cost', t.pathao_cost,
    'neweix_own_cost', t.own_delivery_cost,
    'total_delivery_cost', t.total_cost,
    'entry_count', t.entry_count,
    'delivery_costs_complete', false,
    'status', 'actual_recorded_costs_only'
  ) from totals t;
$function$;

revoke all on function public.supreme_delivery_cost_summary(timestamptz, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.supreme_delivery_cost_summary(timestamptz, timestamptz)
  to service_role;

comment on table public.delivery_cost_entries is
  'Append-only actual delivery cost ledger in BDT. Quotes and customer delivery fees are never treated as actual cost.';
comment on column public.delivery_cost_entries.amount is
  'Positive integer BDT amount; refunds are represented by entry_kind=refund.';
comment on function public.supreme_delivery_cost_summary(timestamptz, timestamptz) is
  'Reports recorded costs only. delivery_costs_complete remains false until all deliveries are reconciled.';

commit;
