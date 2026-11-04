-- Security hardening: atomic Pathao status transitions and server-side order creation throttling.
-- All rate-limit identifiers are SHA-256 hashes; raw client IPs are never stored.

create table if not exists private.order_creation_rate_limits (
  ip_hash text primary key
    check (ip_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null,
  request_count integer not null check (request_count >= 1),
  updated_at timestamptz not null default pg_catalog.now()
);

create index if not exists order_creation_rate_limits_updated_at_idx
  on private.order_creation_rate_limits (updated_at);

alter table private.order_creation_rate_limits enable row level security;
revoke all on table private.order_creation_rate_limits from public, anon, authenticated;
grant all on table private.order_creation_rate_limits to service_role;

create or replace function public.check_order_creation_rate_limit(p_ip_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_count integer;
  v_now timestamptz := pg_catalog.now();
begin
  if p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_RATE_LIMIT_KEY' using errcode = '22023';
  end if;

  insert into private.order_creation_rate_limits (
    ip_hash, window_started_at, request_count, updated_at
  ) values (
    p_ip_hash, v_now, 1, v_now
  )
  on conflict (ip_hash) do update
    set window_started_at = case
          when private.order_creation_rate_limits.window_started_at <= v_now - interval '10 minutes'
            then v_now
          else private.order_creation_rate_limits.window_started_at
        end,
        request_count = case
          when private.order_creation_rate_limits.window_started_at <= v_now - interval '10 minutes'
            then 1
          else private.order_creation_rate_limits.request_count + 1
        end,
        updated_at = v_now
  returning request_count into v_count;

  -- Bound pseudonymous rate-limit metadata to one day.
  delete from private.order_creation_rate_limits
   where updated_at < v_now - interval '1 day';

  return v_count <= 5;
end;
$function$;

revoke all on function public.check_order_creation_rate_limit(text)
  from public, anon, authenticated;
grant execute on function public.check_order_creation_rate_limit(text)
  to service_role;

create or replace function public.apply_pathao_delivery_status(
  p_consignment_id text,
  p_new_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_order_id uuid;
  v_current_status text;
  v_current_rank integer;
  v_next_rank integer;
begin
  if p_consignment_id is null
     or pg_catalog.length(p_consignment_id) < 3
     or pg_catalog.length(p_consignment_id) > 80
     or p_consignment_id !~ '^[A-Za-z0-9-]+$'
     or p_new_status not in ('picked_up', 'in_transit', 'delivered', 'returned', 'cancelled', 'failed') then
    raise exception 'INVALID_PATHAO_STATUS_INPUT' using errcode = '22023';
  end if;

  select o.id, o.delivery_status
    into v_order_id, v_current_status
    from public.orders o
   where o.delivery_provider = 'pathao'
     and o.delivery_consignment_id = p_consignment_id
   for update;

  if not found then
    return pg_catalog.jsonb_build_object('updated', false, 'reason', 'not_found');
  end if;

  v_current_status := coalesce(v_current_status, 'booked');
  v_current_rank := case v_current_status
    when 'booked' then 1
    when 'picked_up' then 2
    when 'in_transit' then 3
    when 'delivered' then 4
    when 'returned' then 4
    when 'cancelled' then 4
    else 0
  end;
  v_next_rank := case p_new_status
    when 'picked_up' then 2
    when 'in_transit' then 3
    when 'delivered' then 4
    when 'returned' then 4
    when 'cancelled' then 4
    else 0
  end;

  if v_current_status = p_new_status then
    return pg_catalog.jsonb_build_object('updated', false, 'unchanged', true, 'delivery_status', v_current_status);
  end if;

  if v_current_status in ('delivered', 'returned', 'cancelled')
     or v_next_rank < v_current_rank then
    return pg_catalog.jsonb_build_object('updated', false, 'reason', 'stale_status', 'delivery_status', v_current_status);
  end if;

  update public.orders
     set delivery_status = p_new_status,
         delivery_error = null,
         updated_at = pg_catalog.now()
   where id = v_order_id;

  return pg_catalog.jsonb_build_object('updated', true, 'delivery_status', p_new_status);
end;
$function$;

revoke all on function public.apply_pathao_delivery_status(text, text)
  from public, anon, authenticated;
grant execute on function public.apply_pathao_delivery_status(text, text)
  to service_role;
