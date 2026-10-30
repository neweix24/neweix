-- NEWEIX customer data foundation: saved addresses, shopping preferences and auditable consent.
-- Additive only. Customer-owned rows are isolated with RLS.

begin;

create table if not exists public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null default 'Home',
  recipient_name text not null,
  phone text not null,
  address_line text not null,
  area text,
  upazila text,
  district text not null,
  division text not null,
  postal_code text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_addresses_label_length check (char_length(label) between 1 and 40),
  constraint customer_addresses_name_length check (char_length(recipient_name) between 2 and 100),
  constraint customer_addresses_phone_length check (char_length(phone) between 6 and 30),
  constraint customer_addresses_line_length check (char_length(address_line) between 5 and 500),
  constraint customer_addresses_area_length check (area is null or char_length(area) <= 120),
  constraint customer_addresses_upazila_length check (upazila is null or char_length(upazila) <= 120),
  constraint customer_addresses_district_length check (char_length(district) between 2 and 120),
  constraint customer_addresses_division_length check (char_length(division) between 2 and 120),
  constraint customer_addresses_postal_length check (postal_code is null or char_length(postal_code) <= 20)
);

create index if not exists customer_addresses_user_created_idx
  on public.customer_addresses (user_id, created_at desc);
create unique index if not exists customer_addresses_one_default_per_user_idx
  on public.customer_addresses (user_id) where is_default = true;

drop trigger if exists customer_addresses_set_updated_at on public.customer_addresses;
create trigger customer_addresses_set_updated_at
  before update on public.customer_addresses
  for each row execute function public.set_updated_at();

alter table public.customer_addresses enable row level security;
drop policy if exists customer_addresses_select_own on public.customer_addresses;
create policy customer_addresses_select_own on public.customer_addresses
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists customer_addresses_insert_own on public.customer_addresses;
create policy customer_addresses_insert_own on public.customer_addresses
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists customer_addresses_update_own on public.customer_addresses;
create policy customer_addresses_update_own on public.customer_addresses
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
drop policy if exists customer_addresses_delete_own on public.customer_addresses;
create policy customer_addresses_delete_own on public.customer_addresses
  for delete to authenticated using ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.customer_addresses to authenticated;
revoke all on public.customer_addresses from anon;

create table if not exists public.customer_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  preferred_sizes text[] not null default '{}',
  preferred_colors text[] not null default '{}',
  preferred_category_ids uuid[] not null default '{}',
  updated_at timestamptz not null default now(),
  constraint customer_preferences_sizes_limit check (cardinality(preferred_sizes) <= 20),
  constraint customer_preferences_colors_limit check (cardinality(preferred_colors) <= 30),
  constraint customer_preferences_categories_limit check (cardinality(preferred_category_ids) <= 30)
);

drop trigger if exists customer_preferences_set_updated_at on public.customer_preferences;
create trigger customer_preferences_set_updated_at
  before update on public.customer_preferences
  for each row execute function public.set_updated_at();

alter table public.customer_preferences enable row level security;
drop policy if exists customer_preferences_select_own on public.customer_preferences;
create policy customer_preferences_select_own on public.customer_preferences
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists customer_preferences_insert_own on public.customer_preferences;
create policy customer_preferences_insert_own on public.customer_preferences
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists customer_preferences_update_own on public.customer_preferences;
create policy customer_preferences_update_own on public.customer_preferences
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
grant select, insert, update on public.customer_preferences to authenticated;
revoke all on public.customer_preferences from anon;

-- Append-only consent ledger. Withdrawal is recorded as a new row with consented=false.
create table if not exists public.customer_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  consent_type text not null check (
    consent_type in ('marketing_email', 'marketing_sms', 'analytics_cookies', 'privacy_policy')
  ),
  consented boolean not null,
  policy_version text not null,
  source text not null default 'account_settings',
  created_at timestamptz not null default now(),
  constraint customer_consents_policy_version_length check (char_length(policy_version) between 1 and 40),
  constraint customer_consents_source_length check (char_length(source) between 1 and 80)
);

create index if not exists customer_consents_user_type_created_idx
  on public.customer_consents (user_id, consent_type, created_at desc);

alter table public.customer_consents enable row level security;
drop policy if exists customer_consents_select_own on public.customer_consents;
create policy customer_consents_select_own on public.customer_consents
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists customer_consents_insert_own on public.customer_consents;
create policy customer_consents_insert_own on public.customer_consents
  for insert to authenticated with check ((select auth.uid()) = user_id);
grant select, insert on public.customer_consents to authenticated;
revoke update, delete, truncate, references, trigger on public.customer_consents from anon, authenticated;
revoke all on public.customer_consents from anon;

commit;
