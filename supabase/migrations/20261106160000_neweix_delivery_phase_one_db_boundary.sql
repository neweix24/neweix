-- Enforce the NEWEIX own-delivery phase-one boundary at database level.
-- Phase one is Mymensingh district only; expanding coverage requires a deliberate migration.
begin;

do $$
begin
  if exists (
    select 1
      from public.neweix_delivery_zones
     where division_code <> 'BD-D08'
        or district_code <> 'BD-D08-Z62'
  ) then
    raise exception 'NEWEIX_DELIVERY_PHASE_ONE_HAS_OUT_OF_SCOPE_ZONES';
  end if;
end;
$$;

alter table public.neweix_delivery_zones
  drop constraint if exists neweix_delivery_phase_one_mymensingh_only;

alter table public.neweix_delivery_zones
  add constraint neweix_delivery_phase_one_mymensingh_only
  check (division_code = 'BD-D08' and district_code = 'BD-D08-Z62');

comment on constraint neweix_delivery_phase_one_mymensingh_only
  on public.neweix_delivery_zones is
  'Phase one own delivery is limited to Mymensingh district. Remove only through an explicit coverage-expansion migration.';

commit;
