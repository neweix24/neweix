-- Remove duplicate permissive SELECT policies with identical predicates.
-- Keep the self-or-senior policy for staff_profiles; it covers both cases.
drop policy if exists "Anyone can view active categories" on public.categories;
drop policy if exists "Staff read own profile" on public.staff_profiles;
