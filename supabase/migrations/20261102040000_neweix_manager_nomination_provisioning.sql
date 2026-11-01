-- Ensure Manager accounts can only be provisioned after Supreme approval.
begin;

alter table public.staff_manager_nominations
  add column if not exists provisioned_user_id uuid references public.staff_profiles(user_id) on delete set null,
  add column if not exists provisioned_at timestamptz;

create unique index if not exists staff_manager_nominations_active_email_uidx
  on public.staff_manager_nominations (lower(btrim(candidate_email)))
  where status in ('pending', 'approved');

create unique index if not exists staff_manager_nominations_provisioned_user_uidx
  on public.staff_manager_nominations (provisioned_user_id)
  where provisioned_user_id is not null;

comment on column public.staff_manager_nominations.provisioned_user_id is
  'Staff profile created from this Supreme-approved Manager nomination.';
comment on column public.staff_manager_nominations.provisioned_at is
  'Timestamp when Supreme provisioned the approved Manager account.';

-- The nominations table contains candidate contact details and review notes.
-- It is server-only: never expose direct Data API access to client roles.
alter table public.staff_manager_nominations enable row level security;
revoke all on public.staff_manager_nominations from anon, authenticated;
grant all on public.staff_manager_nominations to service_role;

commit;
