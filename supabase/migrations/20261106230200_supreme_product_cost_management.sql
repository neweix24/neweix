-- Update the current product acquisition cost and audit it atomically.
begin;

create or replace function public.supreme_update_product_purchase_cost(
  p_actor_id uuid,
  p_product_id uuid,
  p_purchase_cost integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_product public.products%rowtype;
begin
  if not exists (
    select 1 from public.staff_profiles sp
     where sp.user_id = p_actor_id and sp.role = 'supreme' and sp.is_active = true
  ) then
    raise exception 'SUPREME_ACTOR_NOT_AUTHORIZED' using errcode = '42501';
  end if;

  if p_purchase_cost is not null and (p_purchase_cost < 0 or p_purchase_cost > 1000000000) then
    raise exception 'PURCHASE_COST_INVALID' using errcode = '22023';
  end if;

  update public.products
     set purchase_cost = p_purchase_cost,
         updated_at = pg_catalog.now()
   where id = p_product_id
   returning * into v_product;

  if not found then raise exception 'PRODUCT_NOT_FOUND' using errcode = 'P0002'; end if;

  insert into public.audit_logs(actor_id, action, target_type, target_id, details)
  values (
    p_actor_id,
    'product.purchase_cost.updated',
    'product',
    v_product.id::text,
    pg_catalog.jsonb_build_object('purchase_cost', v_product.purchase_cost, 'product_name', v_product.name)
  );

  return pg_catalog.jsonb_build_object(
    'id', v_product.id,
    'name', v_product.name,
    'sku', v_product.sku,
    'purchase_cost', v_product.purchase_cost
  );
end;
$function$;

revoke all on function public.supreme_update_product_purchase_cost(uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.supreme_update_product_purchase_cost(uuid, uuid, integer)
  to service_role;

commit;
