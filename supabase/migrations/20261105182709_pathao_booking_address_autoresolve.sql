-- Include the complete structured destination in Pathao's address-only booking payload.
-- Pathao's July 2025 API update resolves City/Zone/Area from the full address, so
-- the booking route must receive the customer's saved area fields.
begin;

create or replace function public.reserve_pathao_order_booking(
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
  if p_order_id is null or p_actor_id is null then raise exception 'INVALID_INPUT'; end if;
  if not exists (
    select 1 from public.staff_profiles sp
    where sp.user_id = p_actor_id and sp.role in ('supreme','admin') and sp.is_active = true
  ) then raise exception 'ACTOR_NOT_AUTHORIZED'; end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.delivery_consignment_id is not null then raise exception 'PATHAO_ALREADY_BOOKED'; end if;
  if v_order.delivery_status = 'booking' then raise exception 'PATHAO_BOOKING_IN_PROGRESS'; end if;
  if v_order.status not in ('confirmed','processing','packed') then raise exception 'ORDER_NOT_READY_FOR_SHIPPING'; end if;
  if v_order.payment_method <> 'cod' and v_order.payment_status <> 'paid' then raise exception 'ORDER_PAYMENT_NOT_VERIFIED'; end if;
  if v_order.payment_method = 'cod' and v_order.delivery_fee > 0
     and v_order.delivery_fee_payment_status not in ('paid','not_required') then
    raise exception 'COD_DELIVERY_FEE_NOT_VERIFIED';
  end if;
  if v_order.delivery_status not in ('not_booked','failed') then raise exception 'PATHAO_ORDER_STATE_INVALID'; end if;

  update public.orders set delivery_provider='pathao', delivery_status='booking',
    delivery_error=null, updated_at=pg_catalog.now() where id=p_order_id;

  return pg_catalog.jsonb_build_object(
    'id',v_order.id,
    'order_number',v_order.order_number,
    'customer_name',v_order.customer_name,
    'customer_phone',v_order.customer_phone,
    'shipping_address',v_order.shipping_address,
    'shipping_city',v_order.shipping_city,
    'shipping_division',v_order.shipping_division,
    'shipping_district',v_order.shipping_district,
    'shipping_upazila',v_order.shipping_upazila,
    'shipping_union',v_order.shipping_union,
    'shipping_union_other',v_order.shipping_union_other,
    'shipping_village',v_order.shipping_village,
    'total',v_order.total,
    'delivery_fee',v_order.delivery_fee,
    'payment_method',v_order.payment_method,
    'payment_status',v_order.payment_status,
    'delivery_fee_payment_status',v_order.delivery_fee_payment_status,
    'delivery_status','booking'
  );
end;
$function$;

revoke all on function public.reserve_pathao_order_booking(uuid,uuid) from public, anon, authenticated;
grant execute on function public.reserve_pathao_order_booking(uuid,uuid) to service_role;

commit;