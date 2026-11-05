-- NEWEIX departments, tasks and attendance foundation.
-- All writes/reads are performed through authenticated server APIs using
-- a server-only Supabase service role key. Direct Data API access is revoked.
begin;

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 100),
  code text not null unique check (code ~ '^[A-Z0-9][A-Z0-9_-]{1,19}$'),
  description text not null default '' check (char_length(description) <= 1000),
  manager_user_id uuid references public.staff_profiles(user_id) on delete set null,
  is_active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists departments_manager_user_uidx
  on public.departments(manager_user_id) where manager_user_id is not null;

create table if not exists public.department_memberships (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  user_id uuid not null references public.staff_profiles(user_id) on delete cascade,
  assigned_by uuid not null references auth.users(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  unique(user_id),
  unique(department_id, user_id)
);

create table if not exists public.workforce_tasks (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete restrict,
  assigned_to uuid not null references public.staff_profiles(user_id) on delete restrict,
  assigned_by uuid not null references auth.users(id) on delete restrict,
  title text not null check (char_length(btrim(title)) between 3 and 160),
  description text not null default '' check (char_length(description) <= 5000),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'blocked', 'completed', 'cancelled')),
  due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workforce_tasks_department_status_idx
  on public.workforce_tasks(department_id, status, due_at);
create index if not exists workforce_tasks_assignee_status_idx
  on public.workforce_tasks(assigned_to, status, due_at);

create table if not exists public.workforce_attendance (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.staff_profiles(user_id) on delete restrict,
  department_id uuid not null references public.departments(id) on delete restrict,
  attendance_date date not null default (timezone('Asia/Dhaka', now()))::date,
  check_in_at timestamptz,
  check_out_at timestamptz,
  status text not null default 'present' check (status in ('present', 'late', 'half_day', 'leave', 'absent')),
  employee_note text check (employee_note is null or char_length(employee_note) <= 1000),
  manager_note text check (manager_note is null or char_length(manager_note) <= 1000),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, attendance_date),
  check (check_out_at is null or check_in_at is not null),
  check (check_out_at is null or check_out_at >= check_in_at)
);

create index if not exists workforce_attendance_department_date_idx
  on public.workforce_attendance(department_id, attendance_date desc);
create index if not exists workforce_attendance_user_date_idx
  on public.workforce_attendance(user_id, attendance_date desc);

create or replace function public.neweix_workforce_set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists departments_set_updated_at on public.departments;
create trigger departments_set_updated_at before update on public.departments
  for each row execute function public.neweix_workforce_set_updated_at();
drop trigger if exists workforce_tasks_set_updated_at on public.workforce_tasks;
create trigger workforce_tasks_set_updated_at before update on public.workforce_tasks
  for each row execute function public.neweix_workforce_set_updated_at();
drop trigger if exists workforce_attendance_set_updated_at on public.workforce_attendance;
create trigger workforce_attendance_set_updated_at before update on public.workforce_attendance
  for each row execute function public.neweix_workforce_set_updated_at();

alter table public.departments enable row level security;
alter table public.department_memberships enable row level security;
alter table public.workforce_tasks enable row level security;
alter table public.workforce_attendance enable row level security;

revoke all on public.departments, public.department_memberships,
  public.workforce_tasks, public.workforce_attendance
  from anon, authenticated;
grant all on public.departments, public.department_memberships,
  public.workforce_tasks, public.workforce_attendance to service_role;

revoke all on function public.neweix_workforce_set_updated_at() from public, anon, authenticated;

comment on table public.departments is
  'NEWEIX workforce departments. Access through authenticated server APIs only.';
comment on table public.department_memberships is
  'Employee-to-department assignment. One active department per employee.';
comment on table public.workforce_tasks is
  'Department tasks assigned to staff accounts with auditable creator and status.';
comment on table public.workforce_attendance is
  'Daily employee check-in/check-out and manager review records. Bangladesh local date is used by default.';

commit;
