-- NEWEIX workforce roles: retain legacy "staff" while introducing
-- explicit "manager" and "employee" roles. Existing staff accounts remain valid.
begin;

alter table public.staff_profiles
  drop constraint if exists staff_profiles_role_check;

alter table public.staff_profiles
  add constraint staff_profiles_role_check
  check (role in ('supreme', 'admin', 'manager', 'employee', 'staff'));

comment on column public.staff_profiles.role is
  'NEWEIX workforce role: supreme, admin, manager, employee. Legacy staff is retained as an employee-compatible role during migration.';

-- Admins submit manager nominations; only the Supreme review workflow may
-- change the decision. This table intentionally has no client-side RLS policy:
-- API routes must authorize the actor and use a server-only service role.
create table if not exists public.staff_manager_nominations (
  id uuid primary key default gen_random_uuid(),
  candidate_name text not null check (length(btrim(candidate_name)) between 2 and 120),
  candidate_email text not null check (length(btrim(candidate_email)) between 5 and 254),
  reason text not null check (length(btrim(reason)) between 10 and 2000),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'withdrawn')),
  requested_by uuid not null references auth.users(id) on delete restrict,
  reviewed_by uuid references auth.users(id) on delete set null,
  review_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.staff_manager_nominations enable row level security;

create unique index if not exists staff_manager_nominations_one_pending_email_uidx
  on public.staff_manager_nominations (lower(btrim(candidate_email)))
  where status = 'pending';

create index if not exists staff_manager_nominations_status_created_idx
  on public.staff_manager_nominations (status, created_at desc);

comment on table public.staff_manager_nominations is
  'Manager appointment proposals submitted by Admin and reviewed by Supreme. Client access is denied; use authorized server APIs.';

commit;
