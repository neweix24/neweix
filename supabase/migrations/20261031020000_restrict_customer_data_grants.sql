-- Restrict customer data tables to the minimum required privileges.
begin;
revoke all on table public.customer_addresses from public, anon, authenticated;
grant select, insert, update, delete on table public.customer_addresses to authenticated;
revoke all on table public.customer_preferences from public, anon, authenticated;
grant select, insert, update on table public.customer_preferences to authenticated;
revoke all on table public.customer_consents from public, anon, authenticated;
grant select, insert on table public.customer_consents to authenticated;
commit;
