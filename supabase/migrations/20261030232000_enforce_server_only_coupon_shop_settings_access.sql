-- These tables are accessed through trusted server routes using service_role.
-- Do not expose direct table access to browser roles.
revoke all privileges on table public.coupons from anon, authenticated;
revoke all privileges on table public.shop_settings from anon, authenticated;
grant select, insert, update, delete on table public.coupons to service_role;
grant select, insert, update, delete on table public.shop_settings to service_role;
