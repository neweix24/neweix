begin;
create table if not exists public.customer_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid not null,
  device_type text not null default 'unknown' check (device_type in ('mobile','tablet','desktop','unknown')),
  operating_system text not null default 'unknown',
  browser text not null default 'unknown',
  user_agent text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, device_id)
);
create index if not exists customer_devices_user_last_seen_idx on public.customer_devices (user_id,last_seen_at desc);
alter table public.customer_devices enable row level security;
revoke all on public.customer_devices from public, anon, authenticated;
grant all on public.customer_devices to service_role;
comment on table public.customer_devices is 'Minimal customer device registry for account security. Device IDs are random browser identifiers, not fingerprint-derived.';
commit;