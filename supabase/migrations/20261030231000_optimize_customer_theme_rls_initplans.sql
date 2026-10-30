-- Evaluate auth.uid() once per statement instead of once per row.
drop policy if exists "Customers read own theme" on public.customer_theme_settings;
create policy "Customers read own theme" on public.customer_theme_settings
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Customers insert own theme" on public.customer_theme_settings;
create policy "Customers insert own theme" on public.customer_theme_settings
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "Customers update own theme" on public.customer_theme_settings;
create policy "Customers update own theme" on public.customer_theme_settings
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
