-- Financial reporting foundation: timestamp actual delivery/refund events and
-- expose a restricted, period-based gross-margin calculation.
begin;

alter table public.orders
  add column if not exists delivered_at timestamptz,
  add column if not exists returned_at timestamptz;

alter table public.customer_return_requests
  add column if not exists refunded_at timestamptz;

create index if not exists orders_delivered_at_finance_idx
  on public.orders (delivered_at desc)
  where delivered_at is not null;
create index if not exists orders_returned_at_finance_idx
  on public.orders (returned_at desc)
  where returned_at is not null;
create index if not exists customer_return_requests_refunded_at_finance_idx
  on public.customer_return_requests (refunded_at desc)
  where status = 'refunded' and refunded_at is not null;

-- Extend the existing delivery-time trigger rather than installing a
-- competing trigger for the same order status transition.
create or replace function private.neweix_plus_capture_delivery_time()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op = 'INSERT' then
    if new.status::text = 'delivered' and new.delivered_at is null then
      new.delivered_at := pg_catalog.now();
    end if;
    if new.status::text = 'returned' and new.returned_at is null then
      new.returned_at := pg_catalog.now();
    end if;
  else
    if new.status::text = 'delivered'
       and old.status::text is distinct from new.status::text
       and new.delivered_at is null then
      new.delivered_at := pg_catalog.now();
    end if;
    if new.status::text = 'returned'
       and old.status::text is distinct from new.status::text
       and new.returned_at is null then
      new.returned_at := pg_catalog.now();
    end if;
  end if;
  return new;
end;
$function$;

create or replace function public.capture_return_refund_timestamp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.status = 'refunded'
     and (tg_op = 'INSERT' or old.status is distinct from new.status)
     and new.refunded_at is null then
    new.refunded_at := pg_catalog.now();
  end if;
  return new;
end;
$function$;

drop trigger if exists customer_return_requests_capture_refunded_at on public.customer_return_requests;
create trigger customer_return_requests_capture_refunded_at
before insert or update of status on public.customer_return_requests
for each row execute function public.capture_return_refund_timestamp();

revoke all on function public.capture_return_refund_timestamp()
  from public, anon, authenticated;

create or replace function public.supreme_profit_loss_summary(
  p_start_at timestamptz default null,
  p_end_at timestamptz default null
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  with delivered_orders as (
    select o.id, o.subtotal, o.discount
    from public.orders o
    where o.delivered_at is not null
      and (p_start_at is null or o.delivered_at >= p_start_at)
      and (p_end_at is null or o.delivered_at < p_end_at)
  ),
  delivered_lines as (
    select oi.purchase_cost_snapshot, oi.quantity
    from public.order_items oi
    join delivered_orders d on d.id = oi.order_id
  ),
  period_restock_lines as (
    select oi.purchase_cost_snapshot, r.quantity
    from public.order_item_return_restocks r
    join public.order_items oi on oi.id = r.order_item_id
    where (p_start_at is null or r.created_at >= p_start_at)
      and (p_end_at is null or r.created_at < p_end_at)
  ),
  period_refunds as (
    select rr.refund_amount
    from public.customer_return_requests rr
    where rr.refund_amount is not null
      and rr.refunded_at is not null
      and (p_start_at is null or rr.refunded_at >= p_start_at)
      and (p_end_at is null or rr.refunded_at < p_end_at)
  ),
  period_expenses as (
    select e.amount
    from public.operating_expenses e
    where (p_start_at is null or e.expense_date >= (p_start_at at time zone 'Asia/Dhaka')::date)
      and (p_end_at is null or e.expense_date < (p_end_at at time zone 'Asia/Dhaka')::date
        + case when (p_end_at at time zone 'Asia/Dhaka')::time = time '00:00:00' then 0 else 1 end)
  ),
  quality as (
    select
      (select pg_catalog.count(*) from delivered_lines where purchase_cost_snapshot is null)::bigint
        as unknown_delivery_cost_lines,
      (select pg_catalog.count(*) from period_restock_lines where purchase_cost_snapshot is null)::bigint
        as unknown_restock_cost_lines,
      (select pg_catalog.count(*) from public.orders o
        where o.status::text in ('delivered','returned')
          and o.delivered_at is null
          and (p_start_at is null or o.created_at >= p_start_at)
          and (p_end_at is null or o.created_at < p_end_at))::bigint
        as deliveries_missing_event_time,
      (select pg_catalog.count(*) from public.customer_return_requests rr
        where rr.refund_amount is not null and rr.refunded_at is null
          and (p_start_at is null or rr.reviewed_at >= p_start_at)
          and (p_end_at is null or rr.reviewed_at < p_end_at))::bigint
        as refunds_missing_event_time,
      (select pg_catalog.count(*) from public.orders o
        where o.returned_at is not null
          and (p_start_at is null or o.returned_at >= p_start_at)
          and (p_end_at is null or o.returned_at < p_end_at)
          and not exists (
            select 1 from public.customer_return_requests rr
            where rr.order_id = o.id and rr.refund_amount is not null and rr.refunded_at is not null
          ))::bigint as returned_orders_without_recorded_refund,
      (select pg_catalog.count(*) from public.customer_return_requests rr
        join public.orders o on o.id = rr.order_id
        where rr.status in ('requested','approved','received')
          and o.delivered_at is not null
          and (p_start_at is null or o.delivered_at >= p_start_at)
          and (p_end_at is null or o.delivered_at < p_end_at))::bigint
        as unresolved_return_requests
  ),
  totals as (
    select
      coalesce((select pg_catalog.sum(greatest(d.subtotal - d.discount, 0))
        from delivered_orders d), 0)::bigint as recognized_merchandise_sales,
      coalesce((select pg_catalog.sum(refund_amount) from period_refunds), 0)::bigint as recorded_refunds,
      coalesce((select pg_catalog.sum(purchase_cost_snapshot::bigint * quantity)
        from delivered_lines where purchase_cost_snapshot is not null), 0)::bigint
        as known_delivered_cogs,
      coalesce((select pg_catalog.sum(purchase_cost_snapshot::bigint * quantity)
        from period_restock_lines where purchase_cost_snapshot is not null), 0)::bigint
        as known_restock_cogs_reversal,
      coalesce((select pg_catalog.sum(amount) from period_expenses), 0)::bigint
        as operating_expenses,
      (select pg_catalog.count(*) from delivered_lines)::bigint as delivered_line_count,
      (select pg_catalog.count(*) from delivered_lines where purchase_cost_snapshot is not null)::bigint
        as known_cost_delivery_line_count,
      (select pg_catalog.count(*) from period_restock_lines)::bigint as restock_line_count,
      (select pg_catalog.count(*) from period_restock_lines where purchase_cost_snapshot is not null)::bigint
        as known_cost_restock_line_count
  )
  select pg_catalog.jsonb_build_object(
    'recognized_merchandise_sales', t.recognized_merchandise_sales,
    'recorded_refunds', t.recorded_refunds,
    'net_merchandise_sales', t.recognized_merchandise_sales - t.recorded_refunds,
    'known_delivered_cogs', t.known_delivered_cogs,
    'known_restock_cogs_reversal', t.known_restock_cogs_reversal,
    'known_net_cogs', t.known_delivered_cogs - t.known_restock_cogs_reversal,
    'known_gross_profit_component',
      t.recognized_merchandise_sales - t.recorded_refunds
        - t.known_delivered_cogs + t.known_restock_cogs_reversal,
    'operating_expenses', t.operating_expenses,
    'known_operating_result_before_delivery_costs',
      t.recognized_merchandise_sales - t.recorded_refunds
        - t.known_delivered_cogs + t.known_restock_cogs_reversal - t.operating_expenses,
    'delivery_costs_included', false,
    'net_profit', null,
    'cost_coverage_percent', case
      when t.delivered_line_count + t.restock_line_count = 0 then 100
      else pg_catalog.round(
        100.0 * (t.known_cost_delivery_line_count + t.known_cost_restock_line_count)
        / (t.delivered_line_count + t.restock_line_count), 1
      )
    end,
    'gross_profit_is_complete',
      q.unknown_delivery_cost_lines = 0
      and q.unknown_restock_cost_lines = 0
      and q.deliveries_missing_event_time = 0
      and q.refunds_missing_event_time = 0
      and q.returned_orders_without_recorded_refund = 0
      and q.unresolved_return_requests = 0,
    'operating_result_before_delivery_costs_is_complete',
      q.unknown_delivery_cost_lines = 0
      and q.unknown_restock_cost_lines = 0
      and q.deliveries_missing_event_time = 0
      and q.refunds_missing_event_time = 0
      and q.returned_orders_without_recorded_refund = 0
      and q.unresolved_return_requests = 0,
    'quality', pg_catalog.jsonb_build_object(
      'unknown_delivery_cost_lines', q.unknown_delivery_cost_lines,
      'unknown_restock_cost_lines', q.unknown_restock_cost_lines,
      'deliveries_missing_event_time', q.deliveries_missing_event_time,
      'refunds_missing_event_time', q.refunds_missing_event_time,
      'returned_orders_without_recorded_refund', q.returned_orders_without_recorded_refund,
      'unresolved_return_requests', q.unresolved_return_requests
    ),
    'net_profit_status', 'unavailable_until_delivery_costs_are_reconciled'
  )
  from totals t cross join quality q;
$function$;

revoke all on function public.supreme_profit_loss_summary(timestamptz, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.supreme_profit_loss_summary(timestamptz, timestamptz)
  to service_role;

commit;
