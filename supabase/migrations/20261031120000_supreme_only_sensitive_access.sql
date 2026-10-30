-- NEWEIX role boundary:
-- Supreme alone can inspect staff records, audit logs and customer CRM/data requests.
-- Admin retains operational order access, but sensitive CRM routes are Supreme-only.

drop policy if exists audit_logs_read_admin on public.audit_logs;
create policy audit_logs_read_supreme on public.audit_logs
for select to authenticated
using ((select private.has_staff_role(array['supreme'::text])));

drop policy if exists staff_profiles_read_self_or_senior on public.staff_profiles;
create policy staff_profiles_read_self_or_supreme on public.staff_profiles
for select to authenticated
using (
  user_id = (select auth.uid())
  or (select private.has_staff_role(array['supreme'::text]))
);

-- Keep customer-owned data private to its owner at the database layer.
-- Staff and Admin cannot read another customer's profile, addresses, preferences,
-- consent history, or data-request records through the authenticated Data API.

-- Remove table-wide order reads from browser-authenticated users, then grant
-- only operational columns. RLS still limits customers to their own orders;
-- Admin can read operational orders but cannot query private contact/payment references.
revoke select on table public.orders from anon, authenticated;
grant select (
  id,
  order_number,
  customer_id,
  customer_name,
  customer_phone,
  phone,
  address,
  shipping_address,
  shipping_city,
  subtotal,
  delivery_fee,
  discount,
  total,
  payment_method,
  payment_status,
  status,
  created_at,
  updated_at,
  delivery_provider,
  delivery_status,
  delivery_consignment_id,
  delivery_tracking_code,
  delivery_booked_at,
  coupon_code
) on table public.orders to authenticated;
