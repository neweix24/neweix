-- Restore returned inventory only after an admin confirms physical receipt.
-- Each return request is an idempotency boundary; stock cannot be added twice.
begin;

alter table public.customer_return_requests
  add column stock_restocked_at timestamptz,
  add column stock_restocked_by uuid references auth.users(id) on delete set null;

create or replace function public.admin_restock_customer_return_request(
  p_request_id uuid,
  p_actor_id uuid,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_request public.customer_return_requests%rowtype;
  v_entry record;
  v_existing_quantity integer;
  v_already_restored integer;
  v_processed integer := 0;
  v_new_quantity integer := 0;
  v_new_items integer := 0;
  v_items jsonb := '[]'::jsonb;
begin
  if p_request_id is null or p_actor_id is null
     or p_note is null
     or pg_catalog.length(pg_catalog.btrim(p_note)) < 5
     or pg_catalog.length(p_note) > 500 then
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

  select * into v_request
    from public.customer_return_requests
   where id = p_request_id
   for update;
  if not found then raise exception 'RETURN_REQUEST_NOT_FOUND'; end if;
  if v_request.status <> 'received' then raise exception 'RETURN_NOT_RECEIVED'; end if;

  -- Lock selected order lines and products in a stable order.
  perform oi.id
    from public.customer_return_request_items ri
    join public.order_items oi on oi.id = ri.order_item_id
   where ri.return_request_id = p_request_id
   order by oi.product_id, oi.id
   for update of oi;

  if exists (
    select 1
      from public.customer_return_request_items ri
      join public.order_items oi on oi.id = ri.order_item_id
     where ri.return_request_id = p_request_id
       and (oi.order_id <> v_request.order_id or oi.product_id is null)
  ) then
    raise exception 'RETURN_ITEM_PRODUCT_MISSING';
  end if;

  perform p.id
    from public.products p
    join (
      select distinct oi.product_id
        from public.customer_return_request_items ri
        join public.order_items oi on oi.id = ri.order_item_id
       where ri.return_request_id = p_request_id
    ) selected on selected.product_id = p.id
   order by p.id
   for update of p;

  for v_entry in
    select ri.order_item_id, ri.quantity, oi.product_id, oi.quantity as ordered_quantity
      from public.customer_return_request_items ri
      join public.order_items oi on oi.id = ri.order_item_id
     where ri.return_request_id = p_request_id
     order by oi.product_id, oi.id
  loop
    select r.quantity into v_existing_quantity
      from public.order_item_return_restocks r
     where r.order_item_id = v_entry.order_item_id
       and r.idempotency_key = p_request_id;

    if found then
      if v_existing_quantity <> v_entry.quantity then
        raise exception 'IDEMPOTENCY_KEY_REUSED';
      end if;
      v_processed := v_processed + 1;
      v_items := v_items || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('order_item_id', v_entry.order_item_id, 'quantity', v_existing_quantity, 'duplicate', true)
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

    update public.products
       set stock = stock + v_entry.quantity,
           updated_at = pg_catalog.now()
     where id = v_entry.product_id;
    if not found then raise exception 'ORDER_PRODUCT_NOT_FOUND'; end if;

    insert into public.order_item_return_restocks(
      order_id, order_item_id, product_id, quantity,
      idempotency_key, restocked_by, note
    ) values (
      v_request.order_id, v_entry.order_item_id, v_entry.product_id, v_entry.quantity,
      p_request_id, p_actor_id, pg_catalog.btrim(p_note)
    );

    v_processed := v_processed + 1;
    v_new_items := v_new_items + 1;
    v_new_quantity := v_new_quantity + v_entry.quantity;
    v_items := v_items || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('order_item_id', v_entry.order_item_id, 'quantity', v_entry.quantity, 'duplicate', false)
    );
  end loop;

  update public.customer_return_requests
     set stock_restocked_at = coalesce(stock_restocked_at, pg_catalog.now()),
         stock_restocked_by = coalesce(stock_restocked_by, p_actor_id),
         updated_at = pg_catalog.now()
   where id = p_request_id;

  if v_new_items > 0 then
    insert into public.audit_logs(actor_id, action, target_type, target_id, details)
    values (
      p_actor_id,
      'customer_return_request.stock_restocked',
      'customer_return_request',
      p_request_id::text,
      pg_catalog.jsonb_build_object(
        'order_id', v_request.order_id,
        'new_items', v_new_items,
        'new_quantity', v_new_quantity,
        'items', v_items,
        'note', pg_catalog.btrim(p_note)
      )
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'request_id', p_request_id,
    'processed_items', v_processed,
    'restored_quantity', v_new_quantity,
    'already_restocked', v_new_items = 0,
    'items', v_items
  );
end;
$function$;

revoke all on function public.admin_restock_customer_return_request(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.admin_restock_customer_return_request(uuid, uuid, text)
  to service_role;

commit;
