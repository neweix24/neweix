-- Move the SECURITY DEFINER role helper out of the exposed public API schema.
-- Keep the same authorization predicate and preserve RLS policy behavior.

create or replace function private.has_staff_role(required_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.staff_profiles sp
    where sp.user_id = (select auth.uid())
      and sp.role = any(required_roles)
      and sp.is_active = true
  );
$function$;

revoke all on function private.has_staff_role(text[]) from public, anon;
grant usage on schema private to authenticated, service_role;
grant execute on function private.has_staff_role(text[]) to authenticated, service_role;

drop policy if exists audit_logs_read_admin on public.audit_logs;
create policy audit_logs_read_admin on public.audit_logs
for select to authenticated
using ((select private.has_staff_role(array['supreme'::text, 'admin'::text])));

drop policy if exists order_items_read_owner_or_admin on public.order_items;
create policy order_items_read_owner_or_admin on public.order_items
for select to authenticated
using (
  exists (
    select 1 from public.orders o
    where o.id = order_items.order_id
      and (
        o.customer_id = (select auth.uid())
        or (select private.has_staff_role(array['supreme'::text, 'admin'::text]))
      )
  )
);

drop policy if exists orders_read_owner_or_admin on public.orders;
create policy orders_read_owner_or_admin on public.orders
for select to authenticated
using (
  customer_id = (select auth.uid())
  or (select private.has_staff_role(array['supreme'::text, 'admin'::text]))
);

drop policy if exists staff_profiles_read_self_or_senior on public.staff_profiles;
create policy staff_profiles_read_self_or_senior on public.staff_profiles
for select to authenticated
using (
  user_id = (select auth.uid())
  or (select private.has_staff_role(array['supreme'::text, 'admin'::text]))
);

revoke all on function public.has_staff_role(text[]) from public, anon, authenticated;
drop function public.has_staff_role(text[]);
