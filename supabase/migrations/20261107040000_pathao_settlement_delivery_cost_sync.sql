-- Keep exact Pathao settlement precision and atomically sync matched charges
-- into the delivery-cost ledger for every future settlement import.
begin;

alter table public.delivery_cost_entries
  alter column amount type numeric(12,2) using amount::numeric(12,2);

drop function if exists public.supreme_record_delivery_cost(
  uuid,uuid,text,text,text,integer,date,text,text,text
);

create or replace function public.supreme_record_delivery_cost(
  p_actor_id uuid,
  p_order_id uuid,
  p_provider text,
  p_cost_type text,
  p_entry_kind text,
  p_amount numeric,
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
     or p_amount <> round(p_amount, 2)
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
    p_actor_id, 'delivery.cost.recorded', 'delivery_cost_entry', v_entry.id,
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
  uuid,uuid,text,text,text,numeric,date,text,text,text
) from public, anon, authenticated, service_role;
grant execute on function public.supreme_record_delivery_cost(
  uuid,uuid,text,text,text,numeric,date,text,text,text
) to service_role;

create or replace function private.capture_pathao_settlement_delivery_cost()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_import public.pathao_settlement_imports%rowtype;
begin
  if new.matched_order_id is null or new.delivery_charge is null or new.delivery_charge <= 0 then
    return new;
  end if;

  select * into v_import
  from public.pathao_settlement_imports
  where id = new.import_id;

  if not found then
    raise exception 'PATHAO_SETTLEMENT_IMPORT_NOT_FOUND';
  end if;

  insert into public.delivery_cost_entries (
    order_id, provider, cost_type, entry_kind, amount, cost_date,
    source_type, source_reference, settlement_import_id, settlement_row_id,
    notes, recorded_by
  ) values (
    new.matched_order_id, 'pathao', 'delivery_charge', 'charge',
    new.delivery_charge, coalesce(v_import.settlement_date, v_import.imported_at::date),
    'pathao_settlement', new.import_id::text || ':' || new.source_row_number::text,
    new.import_id, new.id,
    'Automatically synchronized from matched Pathao settlement import.',
    v_import.imported_by
  )
  on conflict (settlement_row_id) where settlement_row_id is not null do nothing;

  return new;
end;
$function$;

revoke all on function private.capture_pathao_settlement_delivery_cost()
  from public, anon, authenticated, service_role;

drop trigger if exists pathao_settlement_delivery_cost_sync on public.pathao_settlement_rows;
create trigger pathao_settlement_delivery_cost_sync
after insert on public.pathao_settlement_rows
for each row execute function private.capture_pathao_settlement_delivery_cost();

comment on function private.capture_pathao_settlement_delivery_cost() is
  'Atomically copies matched Pathao delivery charges from settlement imports into the actual delivery cost ledger; unmatched rows are excluded.';

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
                        when provider = 'pathao' and entry_kind = 'refund' then -amount else 0 end),0)::numeric(14,2) as pathao_cost,
      coalesce(sum(case when provider = 'neweix_own' and entry_kind = 'charge' then amount
                        when provider = 'neweix_own' and entry_kind = 'refund' then -amount else 0 end),0)::numeric(14,2) as own_delivery_cost,
      coalesce(sum(case when entry_kind = 'charge' then amount else -amount end),0)::numeric(14,2) as total_cost,
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

comment on column public.delivery_cost_entries.amount is
  'Positive amount in BDT, preserving up to two decimal places; refunds use entry_kind=refund.';
comment on function public.supreme_delivery_cost_summary(timestamptz, timestamptz) is
  'Reports exact recorded costs only. delivery_costs_complete remains false until all deliveries are reconciled.';

commit;
