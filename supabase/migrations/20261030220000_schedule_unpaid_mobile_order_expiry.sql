-- NEWEIX: run unpaid mobile-payment order expiry independently of checkout traffic.
-- Apply after 20261030170000_restore_stock_on_order_cancellation.sql.
-- Supabase Cron stores schedules in PostgreSQL and runs this job every 15 minutes (UTC).

create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'neweix-expire-unpaid-mobile-orders',
  '*/15 * * * *',
  'select public.expire_unpaid_mobile_orders();'
);
