-- Employee-based Pathao rider assignments and auditable finance ledger.
-- Rider identities are existing active employee staff_profiles; no separate rider account type.

begin;

create table if not exists public.pathao_rider_assignments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  rider_user_id uuid not null references public.staff_profiles(user_id) on delete restrict,
  assigned_by uuid references public.staff_profiles(user_id) on delete set null,
  assignment_status text not null default 'assigned'
    check (assignment_status in ('assigned', 'picked_up', 'delivered', 'failed', 'returned', 'cancelled')),
  assigned_at timestamptz not null default now(),
  picked_up_at timestamptz,
  completed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pathao_rider_assignments_notes_length
    check (notes is null or char_length(notes) <= 2000),
  constraint pathao_rider_assignments_completion_consistency
    check (
      (assignment_status in ('delivered', 'failed', 'returned', 'cancelled') and completed_at is not null)
      or (assignment_status in ('assigned', 'picked_up') and completed_at is null)
    )
);

create unique index if not exists pathao_rider_assignments_one_open_per_order_uidx
  on public.pathao_rider_assignments(order_id)
  where assignment_status in ('assigned', 'picked_up');

create index if not exists pathao_rider_assignments_rider_status_idx
  on public.pathao_rider_assignments(rider_user_id, assignment_status, assigned_at desc);

create index if not exists pathao_rider_assignments_order_idx
  on public.pathao_rider_assignments(order_id, assigned_at desc);

create table if not exists public.pathao_rider_finance_ledger (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.pathao_rider_assignments(id) on delete restrict,
  rider_user_id uuid not null references public.staff_profiles(user_id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete restrict,
  entry_type text not null
    check (entry_type in ('delivery_earning', 'bonus', 'adjustment', 'payout', 'reversal')),
  amount numeric(12,2) not null check (amount <> 0),
  currency text not null default 'BDT' check (currency = 'BDT'),
  entry_status text not null default 'pending'
    check (entry_status in ('pending', 'approved', 'paid', 'void')),
  description text,
  reference text,
  created_by uuid references public.staff_profiles(user_id) on delete set null,
  approved_by uuid references public.staff_profiles(user_id) on delete set null,
  approved_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  constraint pathao_rider_ledger_description_length
    check (description is null or char_length(description) <= 2000),
  constraint pathao_rider_ledger_reference_length
    check (reference is null or char_length(reference) <= 160),
  constraint pathao_rider_ledger_approval_consistency
    check (
      (entry_status in ('approved', 'paid') and approved_by is not null and approved_at is not null)
      or (entry_status = 'pending' and approved_by is null and approved_at is null)
      or entry_status = 'void'
    ),
  constraint pathao_rider_ledger_paid_consistency
    check ((entry_status = 'paid' and paid_at is not null) or (entry_status <> 'paid' and paid_at is null))
);

create index if not exists pathao_rider_ledger_rider_status_idx
  on public.pathao_rider_finance_ledger(rider_user_id, entry_status, created_at desc);

create index if not exists pathao_rider_ledger_assignment_idx
  on public.pathao_rider_finance_ledger(assignment_id, created_at);

create index if not exists pathao_rider_ledger_order_idx
  on public.pathao_rider_finance_ledger(order_id);

create or replace function private.enforce_pathao_rider_employee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_active boolean;
begin
  select sp.role, sp.is_active
    into v_role, v_active
  from public.staff_profiles sp
  where sp.user_id = new.rider_user_id;

  if not found or v_active is distinct from true or v_role not in ('employee', 'staff') then
    raise exception 'Pathao rider must be an active NEWEIX employee';
  end if;

  return new;
end;
$$;

drop trigger if exists pathao_rider_assignment_employee_guard on public.pathao_rider_assignments;
create trigger pathao_rider_assignment_employee_guard
before insert or update of rider_user_id on public.pathao_rider_assignments
for each row execute function private.enforce_pathao_rider_employee();

create or replace function private.enforce_pathao_rider_ledger_consistency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rider_user_id uuid;
  v_order_id uuid;
begin
  select a.rider_user_id, a.order_id
    into v_rider_user_id, v_order_id
  from public.pathao_rider_assignments a
  where a.id = new.assignment_id;

  if not found or v_rider_user_id <> new.rider_user_id or v_order_id <> new.order_id then
    raise exception 'Rider finance entry must match its delivery assignment and order';
  end if;

  return new;
end;
$$;

drop trigger if exists pathao_rider_ledger_consistency_guard on public.pathao_rider_finance_ledger;
create trigger pathao_rider_ledger_consistency_guard
before insert or update of assignment_id, rider_user_id, order_id on public.pathao_rider_finance_ledger
for each row execute function private.enforce_pathao_rider_ledger_consistency();

alter table public.pathao_rider_assignments enable row level security;
alter table public.pathao_rider_finance_ledger enable row level security;

revoke all on public.pathao_rider_assignments from public, anon, authenticated;
revoke all on public.pathao_rider_finance_ledger from public, anon, authenticated;

comment on table public.pathao_rider_assignments is
  'Pathao delivery assignments to existing active NEWEIX employee accounts. Writes are server-authorized only.';
comment on table public.pathao_rider_finance_ledger is
  'Auditable BDT rider earnings, adjustments, payouts and reversals. Entries are linked to an employee assignment; no earning rate is assumed by this schema.';

commit;
