-- Fix audit_logs column name and harden payment verification RPC.
-- Applied to Supabase project grhybvlhdnzlopwbaqun as migration
-- 20261030145314_fix_admin_payment_audit_actor_column.

create or replace function public.admin_verify_order_payment(
  p_order_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_order public.orders%rowtype;
begin
  if p_order_id is null or p_actor_id is null then
    raise exception 'INVALID_INPUT';
  end if;

  if not exists (
    select 1
      from public.staff_profiles sp
     where sp.user_id = p_actor_id
       and sp.role in ('supreme', 'admin')
       and sp.is_active = true
  ) then
    raise exception 'ACTOR_NOT_AUTHORIZED';
  end if;

  update public.orders
     set payment_status = 'paid',
         payment_verified_at = pg_catalog.now(),
         payment_verified_by = p_actor_id,
         admin_approved_at = pg_catalog.now(),
         admin_approved_by = p_actor_id
   where id = p_order_id
     and payment_status = 'verification_pending'
     and payment_method in ('bkash', 'nagad', 'rocket')
     and nullif(pg_catalog.btrim(payment_transaction_id), '') is not null
  returning * into v_order;

  if not found then
    raise exception 'ORDER_NOT_VERIFIABLE';
  end if;

  insert into public.audit_logs (
    actor_id,
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
    pg_catalog.jsonb_build_object(
      'order_number', v_order.order_number,
      'payment_method', v_order.payment_method,
      'payment_transaction_id', v_order.payment_transaction_id,
      'payment_status', v_order.payment_status
    )
  );

  return pg_catalog.jsonb_build_object(
    'id', v_order.id,
    'order_number', v_order.order_number,
    'payment_status', v_order.payment_status,
    'payment_verified_at', v_order.payment_verified_at
  );
end;
$function$;

revoke all on function public.admin_verify_order_payment(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.admin_verify_order_payment(uuid, uuid)
  to service_role;
