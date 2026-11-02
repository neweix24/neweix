-- Cover foreign keys used by workforce and department membership queries.
begin;

create index if not exists department_memberships_assigned_by_idx
  on public.department_memberships(assigned_by);

create index if not exists departments_created_by_idx
  on public.departments(created_by);

create index if not exists staff_manager_nominations_requested_by_idx
  on public.staff_manager_nominations(requested_by);

create index if not exists staff_manager_nominations_reviewed_by_idx
  on public.staff_manager_nominations(reviewed_by);

create index if not exists workforce_attendance_reviewed_by_idx
  on public.workforce_attendance(reviewed_by);

create index if not exists workforce_tasks_assigned_by_idx
  on public.workforce_tasks(assigned_by);

commit;
