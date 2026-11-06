-- Finance foundation: preserve actual unit cost for future orders and
-- maintain an immutable, auditable operating-expense ledger.
begin;

alter table public.products
  add column if not exists purchase_cost integer;

alter table public.products
  drop constraint if exists products_purchase_cost_check;
alter table public.products
  add constraint products_purchase_cost_check
  check (purchase_cost is null or purchase_cost >= 0) not valid;

alter table public.order_items
  add column if not exists purchase_cost_snapshot integer;

alter table public.order_items
  drop constraint if exists order_items_purchase_cost_snapshot_check;
alter table public.order_items
  add constraint order_items_purchase_cost_snapshot_check
  check (purchase_cost_snapshot is null or purchase_cost_snapshot >= 0) not valid;

-- Historical order lines remain NULL: current product costs must never be
-- retroactively substituted for unknown historical acquisition costs.
create or replace function public.capture_order_item_purchase_cost()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.purchase_cost_snapshot is null and new.product_id is not null then
    select p.purchase_cost
      into new.purchase_cost_snapshot
      from public.products p
     where p.id = new.product_id;
  end if;
  return new;
end;
$function$;

drop trigger if exists order_items_capture_purchase_cost on public.order_items;
create trigger order_items_capture_purchase_cost
before insert on public.order_items
for each row execute function public.capture_order_item_purchase_cost();

revoke all on function public.capture_order_item_purchase_cost()
  from public, anon, authenticated;

create table if not exists public.operating_expenses (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null,
  category text not null
    check (category in (
      'rent','salary','utilities','marketing','packaging','transport',
      'warehouse','software','maintenance','office','other'
    )),
  amount integer not null check (amount > 0 and amount <= 1000000000),
  description text not null
    check (char_length(btrim(description)) between 3 and 1000),
  vendor text
    check (vendor is null or char_length(btrim(vendor)) between 2 and 160),
  reference_number text
    check (reference_number is null or char_length(btrim(reference_number)) between 1 and 120),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists operating_expenses_date_category_idx
  on public.operating_expenses (expense_date desc, category);
create index if not exists operating_expenses_created_by_idx
  on public.operating_expenses (created_by, created_at desc);

alter table public.operating_expenses enable row level security;
revoke all on public.operating_expenses from public, anon, authenticated, service_role;
grant select on public.operating_expenses to service_role;

comment on column public.products.purchase_cost is
  'Current acquisition cost per unit in BDT. NULL means unknown; never infer from sale price.';
comment on column public.order_items.purchase_cost_snapshot is
  'Acquisition cost captured when the order line is created. Historical NULL values remain unknown.';
comment on table public.operating_expenses is
  'Append-only operating expense ledger in BDT. Mutations are restricted to the authenticated server service role.';

commit;
