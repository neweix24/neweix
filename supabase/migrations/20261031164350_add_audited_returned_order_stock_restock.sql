alter table public.orders
  add column if not exists stock_restored_at timestamptz,
  add column if not exists stock_restored_by uuid references auth.users(id) on delete set null,
  add column if not exists stock_restoration_note text;

create or replace function public.admin_restock_returned_order(
  p_order_id uuid, p_actor_id uuid, p_note text
)
returns jsonb
language plpgsql security definer set search_path = ''
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
    where sp.user_id=p_actor_id and sp.role in ('supreme','admin') and sp.is_active=true
  ) then raise exception 'ACTOR_NOT_AUTHORIZED'; end if;

  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.status <> 'returned' then raise exception 'ORDER_NOT_RETURNED'; end if;
  if v_order.stock_restored_at is not null then raise exception 'STOCK_ALREADY_RESTORED'; end if;

  perform p.id
    from public.products p
    join (
      select oi.product_id from public.order_items oi
      where oi.order_id=p_order_id and oi.product_id is not null
      group by oi.product_id
    ) items on items.product_id=p.id
   order by p.id for update;

  update public.products p
     set stock=p.stock+items.quantity, updated_at=pg_catalog.now()
    from (
      select oi.product_id,sum(oi.quantity)::integer as quantity
      from public.order_items oi
      where oi.order_id=p_order_id and oi.product_id is not null
      group by oi.product_id
    ) items
   where p.id=items.product_id;
  get diagnostics v_item_count=row_count;

  update public.orders set
    stock_restored_at=pg_catalog.now(),
    stock_restored_by=p_actor_id,
    stock_restoration_note=pg_catalog.btrim(p_note),
    updated_at=pg_catalog.now()
  where id=p_order_id;

  return pg_catalog.jsonb_build_object(
    'order_id',p_order_id,'stock_restored_at',pg_catalog.now(),
    'products_updated',v_item_count,'note',pg_catalog.btrim(p_note)
  );
end;
$function$;

revoke all on function public.admin_restock_returned_order(uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function public.admin_restock_returned_order(uuid,uuid,text)
  to service_role;
