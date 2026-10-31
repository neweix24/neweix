begin;

-- A customer may read their own profile, but cannot create or modify the
-- authoritative phone verification fields through the Data API.
revoke insert, update on table public.customer_profiles from anon, authenticated;
grant update (full_name, display_name, avatar_url, date_of_birth, preferred_language)
  on table public.customer_profiles to authenticated;
grant select on table public.customer_profiles to authenticated;

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
  v_delivery_method text := nullif(pg_catalog.btrim(p_delivery_fee_payment_method), '');
  v_delivery_transaction text := nullif(pg_catalog.btrim(p_delivery_fee_payment_transaction_id), '');
begin
  if p_payment_method not in ('cod','bkash','nagad','rocket') then
    raise exception 'INVALID_PAYMENT_METHOD';
  end if;

  if p_payment_method = 'cod' then
    if p_payment_transaction_id is not null then
      raise exception 'COD_PRODUCT_PAYMENT_MUST_BE_EMPTY';
    end if;
    if (v_delivery_method is null) <> (v_delivery_transaction is null) then
      raise exception 'DELIVERY_FEE_PAYMENT_DETAILS_INCOMPLETE';
    end if;
    if v_delivery_method is not null and v_delivery_method not in ('bkash','nagad','rocket') then
      raise exception 'INVALID_DELIVERY_FEE_PAYMENT_METHOD';
    end if;
    if v_delivery_transaction is not null and (
      length(v_delivery_transaction) > 120 or
      v_delivery_transaction !~ '^[A-Za-z0-9-]+$'
    ) then
      raise exception 'INVALID_DELIVERY_FEE_TRANSACTION';
    end if;
  else
    if coalesce(btrim(p_payment_transaction_id),'') = ''
       or length(btrim(p_payment_transaction_id)) > 120
       or btrim(p_payment_transaction_id) !~ '^[A-Za-z0-9-]+$' then
      raise exception 'PRODUCT_PAYMENT_TRANSACTION_REQUIRED';
    end if;
    if v_delivery_method is not null or v_delivery_transaction is not null then
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
    if v_delivery_method is null or v_delivery_transaction is null then
      raise exception 'DELIVERY_FEE_MFS_REQUIRED';
    end if;
    update public.orders set
      delivery_fee_payment_method = v_delivery_method,
      delivery_fee_payment_transaction_id = v_delivery_transaction,
      delivery_fee_payment_status = 'verification_pending'
    where id = v_order_id;
  else
    update public.orders set
      delivery_fee_payment_method = null,
      delivery_fee_payment_transaction_id = null,
      delivery_fee_payment_status = 'not_required'
    where id = v_order_id;
  end if;

  return v_order || pg_catalog.jsonb_build_object(
    'delivery_fee_payment_status',
    case when p_payment_method = 'cod' and v_fee > 0 then 'verification_pending' else 'not_required' end
  );
end;
$function$;

revoke all on function public.create_order_with_prepaid_delivery(text,text,text,text,text,text,text,jsonb,text,uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.create_order_with_prepaid_delivery(text,text,text,text,text,text,text,jsonb,text,uuid,text,text)
  to service_role;

commit;
