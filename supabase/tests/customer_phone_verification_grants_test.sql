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
end;
$$;
