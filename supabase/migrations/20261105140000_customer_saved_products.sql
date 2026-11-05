-- Account-synced customer wishlist and product comparison lists.
begin;

create table if not exists public.customer_saved_products (
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  list_type text not null check (list_type in ('wishlist', 'compare')),
  created_at timestamptz not null default now(),
  primary key (user_id, list_type, product_id)
);

create index if not exists customer_saved_products_user_type_created_idx
  on public.customer_saved_products(user_id, list_type, created_at desc);

alter table public.customer_saved_products enable row level security;
revoke all on public.customer_saved_products from public, anon, authenticated;
grant select, insert, delete on public.customer_saved_products to authenticated;

drop policy if exists customer_saved_products_select_own on public.customer_saved_products;
create policy customer_saved_products_select_own
  on public.customer_saved_products for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists customer_saved_products_insert_own on public.customer_saved_products;
create policy customer_saved_products_insert_own
  on public.customer_saved_products for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists customer_saved_products_delete_own on public.customer_saved_products;
create policy customer_saved_products_delete_own
  on public.customer_saved_products for delete to authenticated
  using ((select auth.uid()) = user_id);

commit;
