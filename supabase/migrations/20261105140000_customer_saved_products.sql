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

-- Enforce the four-product comparison limit transactionally, including concurrent requests.
create or replace function private.enforce_customer_saved_product_limit()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_count integer;
begin
  if new.list_type = 'compare' then
    -- Serialize all compare-list writes for this user before checking for a
    -- duplicate or counting rows. This also makes concurrent duplicate adds
    -- idempotent when the list is already at its four-item limit.
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(new.user_id::text || ':compare', 0)
    );
  end if;

  -- BEFORE INSERT runs before ON CONFLICT DO NOTHING. Returning NULL for an
  -- existing row makes repeat adds safe and avoids a false limit error.
  if exists (
    select 1
      from public.customer_saved_products
      where user_id = new.user_id
        and list_type = new.list_type
        and product_id = new.product_id
  ) then
    return null;
  end if;

  if new.list_type = 'compare' then
    select count(*)::integer into v_count
      from public.customer_saved_products
      where user_id = new.user_id and list_type = 'compare';
    if v_count >= 4 then
      raise exception 'A customer can compare up to 4 products.'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$function$;

revoke all on function private.enforce_customer_saved_product_limit() from public, anon, authenticated;

drop trigger if exists customer_saved_products_enforce_limit on public.customer_saved_products;
create trigger customer_saved_products_enforce_limit
before insert on public.customer_saved_products
for each row execute function private.enforce_customer_saved_product_limit();

commit;
