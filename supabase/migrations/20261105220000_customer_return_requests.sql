-- Customer self-service return requests. No money movement is performed by this workflow.
begin;

create table public.customer_return_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete restrict,
  status text not null default 'requested'
    check (status in ('requested', 'approved', 'rejected', 'received', 'refunded', 'closed')),
  reason text not null
    check (reason in ('damaged', 'wrong_item', 'missing_item', 'not_as_described', 'quality_issue', 'changed_mind', 'other')),
  customer_note text not null default ''
    check (char_length(customer_note) <= 1000),
  staff_note text
    check (staff_note is null or char_length(staff_note) <= 1000),
  refund_amount integer
    check (refund_amount is null or refund_amount >= 0),
  refund_method text
    check (refund_method is null or refund_method in ('original', 'bkash', 'nagad', 'rocket', 'bank', 'eixon', 'manual')),
  refund_reference text
    check (refund_reference is null or char_length(refund_reference) <= 120),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.customer_return_request_items (
  id uuid primary key default gen_random_uuid(),
  return_request_id uuid not null references public.customer_return_requests(id) on delete cascade,
  order_item_id uuid not null references public.order_items(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now(),
  unique (return_request_id, order_item_id)
);

create index customer_return_requests_customer_created_idx
  on public.customer_return_requests(customer_id, created_at desc);
create index customer_return_requests_status_created_idx
  on public.customer_return_requests(status, created_at desc);
create index customer_return_request_items_order_item_idx
  on public.customer_return_request_items(order_item_id);

alter table public.customer_return_requests enable row level security;
alter table public.customer_return_request_items enable row level security;
revoke all on public.customer_return_requests from public, anon, authenticated;
revoke all on public.customer_return_request_items from public, anon, authenticated;
grant all on public.customer_return_requests to service_role;
grant all on public.customer_return_request_items to service_role;

-- A customer can have only one active request for an order at a time.
create unique index customer_return_requests_one_active_per_order_idx
  on public.customer_return_requests(order_id)
  where status in ('requested', 'approved', 'received');

create or replace function public.customer_create_return_request(
  p_customer_id uuid,
  p_order_id uuid,
  p_reason text,
  p_note text,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_order public.orders%rowtype;
  v_request_id uuid;
  v_item record;
  v_ordered_quantity integer;
  v_already_requested integer;
begin
  if p_customer_id is null or p_order_id is null
     or p_reason not in ('damaged', 'wrong_item', 'missing_item', 'not_as_described', 'quality_issue', 'changed_mind', 'other')
     or p_note is null or pg_catalog.char_length(p_note) > 1000
     or p_items is null or pg_catalog.jsonb_typeof(p_items) <> 'array'
     or pg_catalog.jsonb_array_length(p_items) < 1
     or pg_catalog.jsonb_array_length(p_items) > 30 then
    raise exception 'INVALID_RETURN_REQUEST';
  end if;

  if exists (
    select 1 from pg_catalog.jsonb_array_elements(p_items) e
    where pg_catalog.jsonb_typeof(e) <> 'object'
       or coalesce(e->>'order_item_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or coalesce(e->>'quantity', '') !~ '^[1-9][0-9]{0,5}$'
  ) then
    raise exception 'INVALID_RETURN_ITEM';
  end if;

  if exists (
    select (e->>'order_item_id')::uuid
    from pg_catalog.jsonb_array_elements(p_items) e
    group by (e->>'order_item_id')::uuid
    having pg_catalog.count(*) > 1
  ) then
    raise exception 'DUPLICATE_RETURN_ITEM';
  end if;

  select * into v_order
    from public.orders
   where id = p_order_id and customer_id = p_customer_id
   for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.status <> 'delivered' then raise exception 'ORDER_NOT_RETURNABLE'; end if;

  if exists (
    select 1 from public.customer_return_requests r
    where r.order_id = p_order_id
      and r.status in ('requested', 'approved', 'received')
  ) then
    raise exception 'RETURN_REQUEST_ALREADY_ACTIVE';
  end if;

  if (
    select pg_catalog.count(*)
    from pg_catalog.jsonb_array_elements(p_items) e
    join public.order_items oi
      on oi.id = (e->>'order_item_id')::uuid
     and oi.order_id = p_order_id
  ) <> pg_catalog.jsonb_array_length(p_items) then
    raise exception 'ORDER_ITEM_NOT_FOUND';
  end if;

  for v_item in
    select (e->>'order_item_id')::uuid as order_item_id,
           (e->>'quantity')::integer as quantity,
           oi.quantity as ordered_quantity
    from pg_catalog.jsonb_array_elements(p_items) e
    join public.order_items oi
      on oi.id = (e->>'order_item_id')::uuid
     and oi.order_id = p_order_id
    order by oi.id
    for update of oi
  loop
    select coalesce(pg_catalog.sum(ri.quantity), 0)::integer
      into v_already_requested
      from public.customer_return_request_items ri
      join public.customer_return_requests rr on rr.id = ri.return_request_id
     where ri.order_item_id = v_item.order_item_id
       and rr.status in ('requested', 'approved', 'received', 'refunded');

    if v_item.quantity > v_item.ordered_quantity - v_already_requested then
      raise exception 'RETURN_QUANTITY_EXCEEDS_REMAINING';
    end if;
  end loop;

  insert into public.customer_return_requests(customer_id, order_id, reason, customer_note)
  values (p_customer_id, p_order_id, p_reason, pg_catalog.btrim(p_note))
  returning id into v_request_id;

  insert into public.customer_return_request_items(return_request_id, order_item_id, quantity)
  select v_request_id, (e->>'order_item_id')::uuid, (e->>'quantity')::integer
  from pg_catalog.jsonb_array_elements(p_items) e;

  return v_request_id;
end;
$function$;

revoke all on function public.customer_create_return_request(uuid, uuid, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.customer_create_return_request(uuid, uuid, text, text, jsonb)
  to service_role;

commit;
