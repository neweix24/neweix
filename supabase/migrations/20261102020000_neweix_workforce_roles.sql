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

commit;
