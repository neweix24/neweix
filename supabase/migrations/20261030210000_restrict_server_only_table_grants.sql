-- These tables are accessed only by trusted server-side code / SECURITY DEFINER RPCs.
-- RLS remains enabled. Remove direct API-role table privileges so access cannot
-- accidentally become available if a permissive policy is added later.
revoke all privileges on table public.coupons
  from public, anon, authenticated;

revoke all privileges on table public.shop_settings
  from public, anon, authenticated;

-- Keep service_role access explicit for server-side administration and checkout.
grant select, insert, update, delete on table public.coupons to service_role;
grant select, insert, update, delete on table public.shop_settings to service_role;
