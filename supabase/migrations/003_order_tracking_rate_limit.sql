-- NEWEIX: order tracking rate limit
-- Creates a private counter table and a service-role-only RPC.

create schema if not exists private;

revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

create table if not exists private.order_tracking_rate_limits (
client_key text primary key,
window_started_at timestamptz not null,
request_count integer not null default 1
check (request_count >= 1),
updated_at timestamptz not null default now()
);

alter table private.order_tracking_rate_limits enable row level security;

revoke all on table private.order_tracking_rate_limits
from public, anon, authenticated;

grant select, insert, update, delete
on table private.order_tracking_rate_limits
to service_role;

create or replace function public.check_order_tracking_rate_limit(
p_client_key text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
v_now timestamptz := pg_catalog.now();
v_allowed boolean;
begin
if p_client_key is null
or p_client_key !~ '^[a-f0-9]{64}$' then
return false;
end if;

insert into private.order_tracking_rate_limits (
client_key,
window_started_at,
request_count,
updated_at
)
values (
p_client_key,
v_now,
1,
v_now
)
on conflict (client_key) do update
set window_started_at = case
when private.order_tracking_rate_limits.window_started_at
<= v_now - interval '10 minutes'
then v_now
else private.order_tracking_rate_limits.window_started_at
end,
request_count = case
when private.order_tracking_rate_limits.window_started_at
<= v_now - interval '10 minutes'
then 1
else private.order_tracking_rate_limits.request_count + 1
end,
updated_at = v_now
returning request_count <= 5
into v_allowed;

return v_allowed;
end;
$function$;

revoke all on function public.check_order_tracking_rate_limit(text)
from public, anon, authenticated;

grant execute on function public.check_order_tracking_rate_limit(text)
to service_role;