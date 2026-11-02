-- The workforce tables are provisioned in the connected Production project but
-- are not part of the disposable repository migration baseline. Add indexes
-- where the corresponding table/column exists without making local migrations fail.
begin;

do $migration$
begin
  if to_regclass('public.department_memberships') is not null then
    execute 'create index if not exists department_memberships_assigned_by_idx on public.department_memberships(assigned_by)';
  end if;

  if to_regclass('public.departments') is not null then
    execute 'create index if not exists departments_created_by_idx on public.departments(created_by)';
  end if;

  if to_regclass('public.staff_manager_nominations') is not null then
    execute 'create index if not exists staff_manager_nominations_requested_by_idx on public.staff_manager_nominations(requested_by)';
    execute 'create index if not exists staff_manager_nominations_reviewed_by_idx on public.staff_manager_nominations(reviewed_by)';
  end if;

  if to_regclass('public.workforce_attendance') is not null then
    execute 'create index if not exists workforce_attendance_reviewed_by_idx on public.workforce_attendance(reviewed_by)';
  end if;

  if to_regclass('public.workforce_tasks') is not null then
    execute 'create index if not exists workforce_tasks_assigned_by_idx on public.workforce_tasks(assigned_by)';
  end if;
end;
$migration$;

commit;
