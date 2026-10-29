begin;

create or replace function public.admin_verify_order_payment(
  p_order_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.orders%rowtype;
begin
  if p_order_id is null or p_actor_id is null then
    raise exception 'INVALID_INPUT';
  end if;

  update public.orders
  set payment_status = 'paid',
      payment_verified_at = now(),
      payment_verified_by = p_actor_id,
      admin_approved_at = now(),
      admin_approved_by = p_actor_id
  where id = p_order_id
    and payment_status = 'verification_pending'
    and payment_method in ('bkash', 'nagad', 'rocket')
    and nullif(trim(payment_transaction_id), '') is not null
  returning * into v_order;

  if not found then
    raise exception 'ORDER_NOT_VERIFIABLE';
  end if;

  insert into public.audit_logs (
    actor_user_id,
    action,
    target_type,
    target_id,
    details
  )
  values (
    p_actor_id,
    'order_payment_verified',
    'order',
    v_order.id::text,
    jsonb_build_object(
      'order_number', v_order.order_number,
      'payment_method', v_order.payment_method,
      'payment_transaction_id', v_order.payment_transaction_id,
      'payment_status', v_order.payment_status
    )
  );

  return jsonb_build_object(
    'id', v_order.id,
    'order_number', v_order.order_number,
    'payment_status', v_order.payment_status,
    'payment_verified_at', v_order.payment_verified_at
  );
end;
$$;

revoke all on function public.admin_verify_order_payment(uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.admin_verify_order_payment(uuid, uuid)
  to service_role;

commit;
