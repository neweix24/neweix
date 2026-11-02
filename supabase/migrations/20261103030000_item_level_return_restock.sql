-- Item-level, idempotent inventory restoration for partial returns.
begin;

create table if not exists public.order_item_return_restocks (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  order_item_id uuid not null references public.order_items(id) on delete restrict,
  product_id uuid not null,
  quantity integer not null check (quantity > 0),
  idempotency_key uuid not null,
  restocked_by uuid not null references auth.users(id) on delete restrict,
  note text not null check (pg_catalog.length(pg_catalog.btrim(note)) between 5 and 500),
  created_at timestamptz not null default pg_catalog.now(),
  unique (order_item_id, idempotency_key)
);

create index if not exists order_item_return_restocks_order_idx
  on public.order_item_return_restocks(order_id, order_item_id);

alter table public.order_item_return_restocks enable row level security;
revoke all on public.order_item_return_restocks from public, anon, authenticated;
grant all on public.order_item_return_restocks to service_role;

create or replace function public.admin_restock_returned_order_items(
  p_order_id uuid,
  p_actor_id uuid,
  p_note text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_order public.orders%rowtype;
  v_entry record;
  v_product_id uuid;
  v_ordered_quantity integer;
  v_existing_quantity integer;
  v_already_restored integer;
  v_processed integer := 0;
  v_total_quantity integer := 0;
  v_result jsonb := '[]'::jsonb;
begin
  if p_order_id is null or p_actor_id is null
     or p_note is null
     or pg_catalog.length(pg_catalog.btrim(p_note)) < 5
     or pg_catalog.length(p_note) > 500
     or p_items is null
     or pg_catalog.jsonb_typeof(p_items) <> 'array'
     or pg_catalog.jsonb_array_length(p_items) < 1
     or pg_catalog.jsonb_array_length(p_items) > 50 then
    raise exception 'INVALID_RESTOCK_INPUT';
  end if;

  if not exists (
    select 1 from public.staff_profiles sp
     where sp.user_id = p_actor_id
       and sp.role in ('supreme', 'admin')
       and sp.is_active = true
  ) then
    raise exception 'ACTOR_NOT_AUTHORIZED';
  end if;

  if exists (
    select 1
      from pg_catalog.jsonb_array_elements(p_items) e
     where pg_catalog.jsonb_typeof(e) <> 'object'
        or coalesce(e->>'order_item_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        or coalesce(e->>'idempotency_key', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        or coalesce(e->>'quantity', '') !~ '^[1-9][0-9]{0,8}$'
  ) then
    raise exception 'INVALID_RESTOCK_ITEM';
  end if;

  if exists (
    select (e->>'order_item_id')::uuid
      from pg_catalog.jsonb_array_elements(p_items) e
     group by (e->>'order_item_id')::uuid
    having pg_catalog.count(*) > 1
  ) then
    raise exception 'DUPLICATE_RESTOCK_ITEM';
  end if;

  select * into v_order
    from public.orders
   where id = p_order_id
   for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.status <> 'returned' then raise exception 'ORDER_NOT_RETURNED'; end if;
  if v_order.stock_restored_at is not null then raise exception 'STOCK_ALREADY_RESTORED'; end if;

  if (
    select pg_catalog.count(*)
      from pg_catalog.jsonb_array_elements(p_items) e
      join public.order_items oi
        on oi.id = (e->>'order_item_id')::uuid
       and oi.order_id = p_order_id
  ) <> pg_catalog.jsonb_array_length(p_items) then
    raise exception 'ORDER_ITEM_NOT_FOUND';
  end if;

  if exists (
    select 1
      from pg_catalog.jsonb_array_elements(p_items) e
      join public.order_items oi
        on oi.id = (e->>'order_item_id')::uuid
       and oi.order_id = p_order_id
     where oi.product_id is null
  ) then
    raise exception 'ORDER_PRODUCT_REFERENCE_MISSING';
  end if;

  -- Lock order lines and products in deterministic order to avoid deadlocks.
  perform oi.id
    from public.order_items oi
    join pg_catalog.jsonb_array_elements(p_items) e
      on oi.id = (e->>'order_item_id')::uuid
   where oi.order_id = p_order_id
   order by oi.product_id, oi.id
   for update of oi;

  perform p.id
    from public.products p
    join (
      select distinct oi.product_id
        from public.order_items oi
        join pg_catalog.jsonb_array_elements(p_items) e
          on oi.id = (e->>'order_item_id')::uuid
       where oi.order_id = p_order_id
    ) selected on selected.product_id = p.id
   order by p.id
   for update of p;

  for v_entry in
    select
      (e->>'order_item_id')::uuid as order_item_id,
      (e->>'quantity')::integer as quantity,
      (e->>'idempotency_key')::uuid as idempotency_key,
      oi.product_id,
      oi.quantity as ordered_quantity
    from pg_catalog.jsonb_array_elements(p_items) e
    join public.order_items oi
      on oi.id = (e->>'order_item_id')::uuid
     and oi.order_id = p_order_id
    order by oi.product_id, oi.id
  loop
    select r.quantity into v_existing_quantity
      from public.order_item_return_restocks r
     where r.order_item_id = v_entry.order_item_id
       and r.idempotency_key = v_entry.idempotency_key;
    if found then
      if v_existing_quantity <> v_entry.quantity then
        raise exception 'IDEMPOTENCY_KEY_REUSED';
      end if;
      v_processed := v_processed + 1;
      v_total_quantity := v_total_quantity + v_existing_quantity;
      v_result := v_result || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'order_item_id', v_entry.order_item_id,
          'quantity', v_existing_quantity,
          'duplicate', true
        )
      );
      continue;
    end if;

    select coalesce(pg_catalog.sum(r.quantity), 0)::integer
      into v_already_restored
      from public.order_item_return_restocks r
     where r.order_item_id = v_entry.order_item_id;

    if v_entry.quantity > v_entry.ordered_quantity - v_already_restored then
      raise exception 'RESTOCK_QUANTITY_EXCEEDS_RETURNED';
    end if;

    select p.id into v_product_id
      from public.products p
     where p.id = v_entry.product_id;
    if not found then raise exception 'ORDER_PRODUCT_NOT_FOUND'; end if;

    update public.products
       set stock = stock + v_entry.quantity,
           updated_at = pg_catalog.now()
     where id = v_entry.product_id;

    insert into public.order_item_return_restocks(
      order_id, order_item_id, product_id, quantity,
      idempotency_key, restocked_by, note
    ) values (
      p_order_id, v_entry.order_item_id, v_entry.product_id, v_entry.quantity,
      v_entry.idempotency_key, p_actor_id, pg_catalog.btrim(p_note)
    );

    v_processed := v_processed + 1;
    v_total_quantity := v_total_quantity + v_entry.quantity;
    v_result := v_result || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'order_item_id', v_entry.order_item_id,
        'quantity', v_entry.quantity,
        'duplicate', false
      )
    );
  end loop;

  if not exists (
    select 1
      from public.order_items oi
     where oi.order_id = p_order_id
       and coalesce((
         select pg_catalog.sum(r.quantity)
           from public.order_item_return_restocks r
          where r.order_item_id = oi.id
       ), 0) < oi.quantity
  ) then
    update public.orders
       set stock_restored_at = pg_catalog.now(),
           stock_restored_by = p_actor_id,
           stock_restoration_note = pg_catalog.btrim(p_note),
           updated_at = pg_catalog.now()
     where id = p_order_id;
  end if;

  return pg_catalog.jsonb_build_object(
    'order_id', p_order_id,
    'processed_items', v_processed,
    'restored_quantity', v_total_quantity,
    'items', v_result
  );
end;
$function$;

revoke all on function public.admin_restock_returned_order_items(uuid, uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.admin_restock_returned_order_items(uuid, uuid, text, jsonb)
  to service_role;

-- Prevent the legacy all-at-once RPC from bypassing item-level partial restock history.
create or replace function public.admin_restock_returned_order(
  p_order_id uuid, p_actor_id uuid, p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_order public.orders%rowtype;
  v_item_count integer;
begin
  if p_order_id is null or p_actor_id is null or p_note is null
     or pg_catalog.length(pg_catalog.btrim(p_note)) < 5
     or pg_catalog.length(p_note) > 500 then
    raise exception 'INVALID_RESTOCK_INPUT';
  end if;
  if not exists (
    select 1 from public.staff_profiles sp
     where sp.user_id = p_actor_id
       and sp.role in ('supreme','admin')
       and sp.is_active = true
  ) then
    raise exception 'ACTOR_NOT_AUTHORIZED';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.status <> 'returned' then raise exception 'ORDER_NOT_RETURNED'; end if;
  if v_order.stock_restored_at is not null then raise exception 'STOCK_ALREADY_RESTORED'; end if;
  if exists (select 1 from public.order_item_return_restocks r where r.order_id = p_order_id) then
    raise exception 'ITEM_LEVEL_RESTOCK_EXISTS';
  end if;
  if not exists (select 1 from public.order_items oi where oi.order_id = p_order_id) then
    raise exception 'ORDER_ITEMS_MISSING';
  end if;
  if exists (select 1 from public.order_items oi where oi.order_id = p_order_id and oi.product_id is null) then
    raise exception 'ORDER_PRODUCT_REFERENCE_MISSING';
  end if;

  perform p.id
    from public.products p
    join (
      select oi.product_id from public.order_items oi
       where oi.order_id = p_order_id group by oi.product_id
    ) items on items.product_id = p.id
   order by p.id for update;

  update public.products p
     set stock = p.stock + items.quantity,
         updated_at = pg_catalog.now()
    from (
      select oi.product_id, pg_catalog.sum(oi.quantity)::integer as quantity
        from public.order_items oi
       where oi.order_id = p_order_id
       group by oi.product_id
    ) items
   where p.id = items.product_id;
  get diagnostics v_item_count = row_count;
  if v_item_count = 0 then raise exception 'ORDER_PRODUCTS_NOT_FOUND'; end if;

  update public.orders
     set stock_restored_at = pg_catalog.now(),
         stock_restored_by = p_actor_id,
         stock_restoration_note = pg_catalog.btrim(p_note),
         updated_at = pg_catalog.now()
   where id = p_order_id;

  return pg_catalog.jsonb_build_object(
    'order_id', p_order_id,
    'stock_restored_at', pg_catalog.now(),
    'products_updated', v_item_count,
    'note', pg_catalog.btrim(p_note)
  );
end;
$function$;

revoke all on function public.admin_restock_returned_order(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.admin_restock_returned_order(uuid, uuid, text)
  to service_role;

commit;
