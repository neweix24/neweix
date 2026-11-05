-- Explicit, auditable mapping between NEWEIX administrative areas and Pathao's
-- independently assigned City/Zone identifiers. Names alone are never trusted
-- during checkout; only verified mappings may be used for live price quotes.
begin;

create table if not exists public.pathao_location_mappings (
  id uuid primary key default gen_random_uuid(),
  division_code text not null,
  district_code text not null,
  upazila_code text not null,
  pathao_city_id integer not null,
  pathao_zone_id integer not null,
  pathao_city_name text not null,
  pathao_zone_name text not null,
  is_verified boolean not null default false,
  is_active boolean not null default true,
  verified_at timestamptz,
  verified_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pathao_location_mappings_division_format
    check (division_code ~ '^BD-D[0-9]{2}$'),
  constraint pathao_location_mappings_district_format
    check (district_code ~ '^BD-D[0-9]{2}-Z[0-9]{2}$'),
  constraint pathao_location_mappings_upazila_format
    check (upazila_code ~ '^BD-D[0-9]{2}-Z[0-9]{2}-U[0-9]{3}$'),
  constraint pathao_location_mappings_city_id_positive
    check (pathao_city_id > 0),
  constraint pathao_location_mappings_zone_id_positive
    check (pathao_zone_id > 0),
  constraint pathao_location_mappings_names_valid
    check (
      char_length(btrim(pathao_city_name)) between 2 and 120
      and char_length(btrim(pathao_zone_name)) between 2 and 120
    ),
  constraint pathao_location_mappings_verified_metadata
    check (
      (is_verified = false and verified_at is null)
      or (is_verified = true and verified_at is not null)
    ),
  constraint pathao_location_mappings_area_unique
    unique (district_code, upazila_code)
);

create index if not exists pathao_location_mappings_lookup_idx
  on public.pathao_location_mappings (district_code, upazila_code)
  where is_active = true and is_verified = true;

alter table public.pathao_location_mappings enable row level security;
revoke all on table public.pathao_location_mappings from public, anon, authenticated;
grant select, insert, update, delete on table public.pathao_location_mappings to service_role;

comment on table public.pathao_location_mappings is
  'Verified mapping from Bangladesh administrative upazila codes to Pathao City/Zone IDs; managed server-side by authorized staff.';

commit;
