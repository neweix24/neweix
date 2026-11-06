-- Full-history Supreme dashboard aggregation. The caller must authenticate the Supreme
-- account and complete MFA in the server route before invoking this service-role RPC.
create or replace function public.supreme_dashboard_summary(
  p_start_at timestamptz default null,
  p_end_at timestamptz default null
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  with filtered_orders as (
    select
      o.id,
      o.order_number,
      o.created_at,
      o.status::text as status,
      o.total,
      o.payment_status,
      o.shipping_district,
      o.shipping_upazila
    from public.orders o
    where (p_start_at is null or o.created_at >= p_start_at)
      and (p_end_at is null or o.created_at < p_end_at)
  ),
  district_totals as (
    select
      coalesce(nullif(pg_catalog.btrim(shipping_district), ''), 'ঠিকানা অনুপস্থিত') as district,
      pg_catalog.sum(total)::bigint as order_value,
      pg_catalog.count(*)::bigint as order_count
    from filtered_orders
    group by 1
    order by pg_catalog.sum(total) desc, district asc
    limit 10
  ),
  recent_orders as (
    select
      id, order_number, created_at, status, total, payment_status,
      shipping_district, shipping_upazila
    from filtered_orders
    order by created_at desc, id desc
    limit 8
  )
  select pg_catalog.jsonb_build_object(
    'order_count', (select pg_catalog.count(*) from filtered_orders),
    'order_value', coalesce((select pg_catalog.sum(total) from filtered_orders), 0),
    'paid_amount', coalesce((
      select pg_catalog.sum(total)
      from filtered_orders
      where payment_status = 'paid'
    ), 0),
    'pending_payment_count', (
      select pg_catalog.count(*)
      from filtered_orders
      where payment_status is distinct from 'paid'
        and payment_status not in ('failed', 'cancelled')
    ),
    'pending_order_count', (
      select pg_catalog.count(*)
      from filtered_orders
      where status not in ('delivered', 'cancelled', 'returned')
    ),
    'district_totals', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'district', district,
          'order_value', order_value,
          'order_count', order_count
        )
        order by order_value desc, district asc
      )
      from district_totals
    ), '[]'::jsonb),
    'recent_orders', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', id,
          'order_number', order_number,
          'created_at', created_at,
          'status', status,
          'total', total,
          'payment_status', payment_status,
          'shipping_district', shipping_district,
          'shipping_upazila', shipping_upazila
        )
        order by created_at desc, id desc
      )
      from recent_orders
    ), '[]'::jsonb)
  );
$function$;

revoke all on function public.supreme_dashboard_summary(timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.supreme_dashboard_summary(timestamptz, timestamptz)
  to service_role;

create index if not exists orders_supreme_dashboard_created_at_idx
  on public.orders (created_at desc);
