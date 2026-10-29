create or replace function public.admin_update_order_status(
  p_order_id uuid,
  p_new_status text,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_status text;
begin
  if p_new_status is null or p_new_status not in (
    'pending', 'confirmed', 'processing', 'packed',
    'shipped', 'delivered', 'cancelled', 'returned'
  ) then
    raise exception 'INVALID_ORDER_STATUS';
  end if;

  if p_actor_id is null then
    raise exception 'ACTOR_REQUIRED';
  end if;

  select status into v_old_status
    from public.orders
   where id = p_order_id
   for update;

  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;

  if v_old_status = p_new_status then
    return jsonb_build_object(
      'order_id', p_order_id,
      'old_status', v_old_status,
      'new_status', p_new_status,
      'changed', false
    );
  end if;

  update public.orders
     set status = p_new_status,
         updated_at = now()
   where id = p_order_id;

  insert into public.audit_logs (
    actor_id, action, target_type, target_id, details
  ) values (
    p_actor_id,
    'admin_order_status_updated',
    'order',
    p_order_id::text,
    jsonb_build_object(
      'old_status', v_old_status,
      'new_status', p_new_status
    )
  );

  return jsonb_build_object(
    'order_id', p_order_id,
    'old_status', v_old_status,
    'new_status', p_new_status,
    'changed', true
  );
end;
$$;

revoke all on function public.admin_update_order_status(uuid, text, uuid) from public;
revoke all on function public.admin_update_order_status(uuid, text, uuid) from anon;
revoke all on function public.admin_update_order_status(uuid, text, uuid) from authenticated;
grant execute on function public.admin_update_order_status(uuid, text, uuid) to service_role;
