begin;
create table if not exists public.customer_device_access_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid not null,
  ip_address inet not null,
  user_agent text,
  accessed_at timestamptz not null default now()
);
create index if not exists customer_device_access_logs_user_accessed_idx on public.customer_device_access_logs (user_id,accessed_at desc);
create index if not exists customer_device_access_logs_device_accessed_idx on public.customer_device_access_logs (user_id,device_id,accessed_at desc);
alter table public.customer_device_access_logs enable row level security;
revoke all on public.customer_device_access_logs from public, anon, authenticated;
grant all on public.customer_device_access_logs to service_role;
comment on table public.customer_device_access_logs is 'Customer sign-in IP history for account security. IP addresses are personal data and should be retained only as long as needed.';
commit;