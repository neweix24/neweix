alter table public.orders
  add column if not exists delivery_fee_payment_method text,
  add column if not exists delivery_fee_payment_transaction_id text,
  add column if not exists delivery_fee_payment_status text not null default 'not_required',
  add column if not exists delivery_fee_payment_verified_at timestamptz,
  add column if not exists delivery_fee_payment_verified_by uuid;

alter table public.orders drop constraint if exists orders_delivery_fee_payment_status_check;
alter table public.orders add constraint orders_delivery_fee_payment_status_check
  check (delivery_fee_payment_status in ('not_required','verification_pending','paid','failed'));

alter table public.orders drop constraint if exists orders_delivery_fee_payment_method_check;
alter table public.orders add constraint orders_delivery_fee_payment_method_check
  check (delivery_fee_payment_method is null or delivery_fee_payment_method in ('bkash','nagad','rocket'));

create unique index if not exists orders_delivery_fee_payment_transaction_id_uidx
  on public.orders (upper(btrim(delivery_fee_payment_transaction_id)))
  where delivery_fee_payment_transaction_id is not null and btrim(delivery_fee_payment_transaction_id) <> '';

create or replace function public.create_order_with_prepaid_delivery(
  p_customer_name text, p_customer_phone text, p_customer_email text,
  p_shipping_address text, p_shipping_city text, p_payment_method text,
  p_payment_transaction_id text, p_items jsonb, p_coupon_code text,
  p_customer_id uuid, p_delivery_fee_payment_method text,
  p_delivery_fee_payment_transaction_id text
) returns jsonb
language plpgsql security definer set search_path = ''
as $function$
declare
  v_order jsonb;
  v_order_id uuid;
  v_fee numeric;
begin
  if p_payment_method not in ('cod','bkash','nagad','rocket') then raise exception 'INVALID_PAYMENT_METHOD'; end if;

  if p_payment_method = 'cod' then
    if p_payment_transaction_id is not null then raise exception 'COD_PRODUCT_PAYMENT_MUST_BE_EMPTY'; end if;
    if p_delivery_fee_payment_method not in ('bkash','nagad','rocket') then raise exception 'DELIVERY_FEE_MFS_REQUIRED'; end if;
    if coalesce(btrim(p_delivery_fee_payment_transaction_id),'') = ''
       or length(btrim(p_delivery_fee_payment_transaction_id)) > 120
       or btrim(p_delivery_fee_payment_transaction_id) !~ '^[A-Za-z0-9-]+$' then
      raise exception 'DELIVERY_FEE_TRANSACTION_REQUIRED';
    end if;
  else
    if coalesce(btrim(p_payment_transaction_id),'') = ''
       or length(btrim(p_payment_transaction_id)) > 120
       or btrim(p_payment_transaction_id) !~ '^[A-Za-z0-9-]+$' then
      raise exception 'PRODUCT_PAYMENT_TRANSACTION_REQUIRED';
    end if;
    if p_delivery_fee_payment_method is not null or p_delivery_fee_payment_transaction_id is not null then
      raise exception 'DUPLICATE_DELIVERY_FEE_PAYMENT_NOT_ALLOWED';
    end if;
  end if;

  v_order := public.create_order_with_coupon(
    p_customer_name, p_customer_phone, p_customer_email, p_shipping_address,
    p_shipping_city, p_payment_method, p_payment_transaction_id, p_items,
    p_coupon_code, p_customer_id
  );
  v_order_id := (v_order ->> 'id')::uuid;
  v_fee := coalesce((v_order ->> 'delivery_fee')::numeric,0);

  if p_payment_method = 'cod' and v_fee > 0 then
    update public.orders set
      delivery_fee_payment_method = p_delivery_fee_payment_method,
      delivery_fee_payment_transaction_id = btrim(p_delivery_fee_payment_transaction_id),
      delivery_fee_payment_status = 'verification_pending'
    where id = v_order_id;
  else
    update public.orders set delivery_fee_payment_status = 'not_required' where id = v_order_id;
  end if;

  return v_order || pg_catalog.jsonb_build_object(
    'delivery_fee_payment_status',
    case when p_payment_method = 'cod' and v_fee > 0 then 'verification_pending' else 'not_required' end
  );
end;
$function$;

revoke all on function public.create_order_with_prepaid_delivery(text,text,text,text,text,text,text,jsonb,text,uuid,text,text) from public, anon, authenticated;
grant execute on function public.create_order_with_prepaid_delivery(text,text,text,text,text,text,text,jsonb,text,uuid,text,text) to service_role;

create or replace function public.admin_verify_order_delivery_fee_payment(p_order_id uuid,p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare v_order public.orders%rowtype;
begin
  if p_order_id is null or p_actor_id is null then raise exception 'INVALID_INPUT'; end if;
  if not exists (
    select 1 from public.staff_profiles sp
    where sp.user_id=p_actor_id and sp.role in ('supreme','admin') and sp.is_active=true
  ) then raise exception 'ACTOR_NOT_AUTHORIZED'; end if;

  update public.orders set
    delivery_fee_payment_status='paid',
    delivery_fee_payment_verified_at=pg_catalog.now(),
    delivery_fee_payment_verified_by=p_actor_id
  where id=p_order_id and payment_method='cod' and delivery_fee>0
    and delivery_fee_payment_status='verification_pending'
    and delivery_fee_payment_method in ('bkash','nagad','rocket')
    and nullif(pg_catalog.btrim(delivery_fee_payment_transaction_id),'') is not null
  returning * into v_order;

  if not found then raise exception 'DELIVERY_FEE_PAYMENT_NOT_VERIFIABLE'; end if;

  insert into public.audit_logs(actor_id,action,target_type,target_id,details)
  values(p_actor_id,'order_delivery_fee_payment_verified','order',v_order.id::text,
    pg_catalog.jsonb_build_object(
      'order_number',v_order.order_number,'delivery_fee',v_order.delivery_fee,
      'delivery_fee_payment_method',v_order.delivery_fee_payment_method,
      'delivery_fee_payment_transaction_id',v_order.delivery_fee_payment_transaction_id
    ));

  return pg_catalog.jsonb_build_object(
    'id',v_order.id,'order_number',v_order.order_number,
    'delivery_fee_payment_status',v_order.delivery_fee_payment_status,
    'delivery_fee_payment_verified_at',v_order.delivery_fee_payment_verified_at
  );
end;
$function$;

revoke all on function public.admin_verify_order_delivery_fee_payment(uuid,uuid) from public, anon, authenticated;
grant execute on function public.admin_verify_order_delivery_fee_payment(uuid,uuid) to service_role;
