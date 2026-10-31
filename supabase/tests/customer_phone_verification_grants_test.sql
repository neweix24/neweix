-- Regression test: authenticated customers must never write the OTP-verified phone fields.
do $$
begin
  if has_column_privilege('authenticated', 'public.customer_profiles', 'phone', 'UPDATE') then
    raise exception 'SECURITY REGRESSION: authenticated can UPDATE customer_profiles.phone';
  end if;
  if has_column_privilege('authenticated', 'public.customer_profiles', 'phone_verified_at', 'UPDATE') then
    raise exception 'SECURITY REGRESSION: authenticated can UPDATE customer_profiles.phone_verified_at';
  end if;
  if has_column_privilege('authenticated', 'public.customer_profiles', 'phone_verified_at', 'INSERT') then
    raise exception 'SECURITY REGRESSION: authenticated can INSERT customer_profiles.phone_verified_at';
  end if;
  if not has_column_privilege('authenticated', 'public.customer_profiles', 'display_name', 'UPDATE') then
    raise exception 'PROFILE REGRESSION: authenticated lost display_name update permission';
  end if;
  if has_function_privilege('authenticated', 'public.reserve_phone_verification_challenge(uuid,uuid,text,text,timestamptz)', 'EXECUTE') then
    raise exception 'SECURITY REGRESSION: authenticated can reserve phone OTP challenges';
  end if;
  if has_function_privilege('authenticated', 'public.reserve_pathao_order_booking(uuid,uuid)', 'EXECUTE') then
    raise exception 'SECURITY REGRESSION: authenticated can reserve Pathao shipments';
  end if;
  if has_function_privilege('authenticated', 'public.admin_restock_returned_order(uuid,uuid,text)', 'EXECUTE') then
    raise exception 'SECURITY REGRESSION: authenticated can invoke returned-order stock restock';
  end if;
end;
$$;
