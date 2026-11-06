-- Persist Pathao's live Area catalog for every mapped City/Zone pair.
-- Area availability is informational; final parcel acceptance remains with Pathao.
begin;

create table if not exists public.pathao_area_catalog (
  id uuid primary key default gen_random_uuid(),
  pathao_city_id integer not null check (pathao_city_id > 0),
  pathao_zone_id integer not null check (pathao_zone_id > 0),
  pathao_area_id integer not null check (pathao_area_id > 0),
  pathao_area_name text not null check (char_length(btrim(pathao_area_name)) between 1 and 160),
  home_delivery_available boolean,
  is_active boolean not null default true,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pathao_area_catalog_zone_area_unique unique (pathao_zone_id, pathao_area_id)
);

create index if not exists pathao_area_catalog_city_zone_idx
  on public.pathao_area_catalog (pathao_city_id, pathao_zone_id)
  where is_active = true;

create index if not exists pathao_area_catalog_name_idx
  on public.pathao_area_catalog (lower(pathao_area_name))
  where is_active = true;

alter table public.pathao_area_catalog enable row level security;
revoke all on table public.pathao_area_catalog from public, anon, authenticated;
grant select, insert, update, delete on table public.pathao_area_catalog to service_role;

comment on table public.pathao_area_catalog is
  'Server-managed snapshot of Pathao Area IDs and delivery availability for zones already mapped to Bangladesh upazilas.';

commit;
