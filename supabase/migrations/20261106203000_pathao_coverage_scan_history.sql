-- Persist Pathao nationwide coverage scan results, including API/network failures.
begin;
create table if not exists public.pathao_coverage_scan_districts (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null,
  division_code text not null,
  district_code text not null,
  district_name text not null,
  status text not null,
  pathao_city_name text,
  total_upazilas integer not null default 0,
  matched_upazilas integer not null default 0,
  skipped_upazilas jsonb not null default '[]'::jsonb,
  error text,
  actor_id uuid references auth.users(id) on delete set null,
  scanned_at timestamptz not null default now(),
  constraint pathao_coverage_scan_division_format check (division_code ~ '^BD-D[0-9]{2}$'),
  constraint pathao_coverage_scan_district_format check (district_code ~ '^BD-D[0-9]{2}-Z[0-9]{2}$'),
  constraint pathao_coverage_scan_counts check (total_upazilas >= 0 and matched_upazilas >= 0 and matched_upazilas <= total_upazilas),
  constraint pathao_coverage_scan_status check (status in ('sync_error','city_not_found','city_ambiguous','zones_unavailable','no_exact_zone_match','partially_matched_candidates','fully_matched_candidates')),
  constraint pathao_coverage_scan_skipped_array check (jsonb_typeof(skipped_upazilas) = 'array'),
  constraint pathao_coverage_scan_unique_district unique (scan_id, district_code)
);
create index if not exists pathao_coverage_scan_latest_idx on public.pathao_coverage_scan_districts (scanned_at desc);
create index if not exists pathao_coverage_scan_id_idx on public.pathao_coverage_scan_districts (scan_id, division_code, district_code);
alter table public.pathao_coverage_scan_districts enable row level security;
revoke all on table public.pathao_coverage_scan_districts from public, anon, authenticated;
grant select, insert, update, delete on table public.pathao_coverage_scan_districts to service_role;
comment on table public.pathao_coverage_scan_districts is 'Auditable per-district Pathao coverage scan outcomes, including transient failures and retry diagnostics.';
commit;
