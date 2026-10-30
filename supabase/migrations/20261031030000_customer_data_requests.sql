-- Customer data request queue. Client users can only create and read their own requests.
begin;
create table if not exists public.customer_data_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  request_type text not null check (request_type in ('export', 'correction', 'delete')),
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'rejected')),
  customer_message text,
  resolution_note text,
  processed_by uuid,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_data_requests_message_length check (customer_message is null or char_length(customer_message) <= 1000),
  constraint customer_data_requests_resolution_length check (resolution_note is null or char_length(resolution_note) <= 1000)
);
create index if not exists customer_data_requests_user_created_idx on public.customer_data_requests (user_id, created_at desc);
create index if not exists customer_data_requests_status_created_idx on public.customer_data_requests (status, created_at asc);
create unique index if not exists customer_data_requests_one_open_type_idx
  on public.customer_data_requests (user_id, request_type)
  where status in ('pending', 'processing');
drop trigger if exists customer_data_requests_set_updated_at on public.customer_data_requests;
create trigger customer_data_requests_set_updated_at before update on public.customer_data_requests
  for each row execute function public.set_updated_at();
alter table public.customer_data_requests enable row level security;
drop policy if exists customer_data_requests_select_own on public.customer_data_requests;
create policy customer_data_requests_select_own on public.customer_data_requests
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists customer_data_requests_insert_own on public.customer_data_requests;
create policy customer_data_requests_insert_own on public.customer_data_requests
  for insert to authenticated with check (
    (select auth.uid()) = user_id and status = 'pending'
    and processed_by is null and processed_at is null and resolution_note is null
  );
revoke all on public.customer_data_requests from public, anon, authenticated;
grant select, insert on public.customer_data_requests to authenticated;
commit;
