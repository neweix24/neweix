-- Restore customer-owned order history reads; RLS policies still scope rows.
grant select on table public.orders to authenticated;
grant select on table public.order_items to authenticated;

-- Theme preferences are customer-owned. Remove broad/unsafe grants and
-- re-grant only the operations supported by the existing RLS policies.
revoke all privileges on table public.customer_theme_settings from anon, authenticated;
grant select, insert, update on table public.customer_theme_settings to authenticated;
