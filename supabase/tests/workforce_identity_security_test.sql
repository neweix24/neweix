begin;

do $$
declare
  v_table text;
  v_relation regclass;
  v_privilege text;
  v_privileges text[] := array['SELECT','INSERT','UPDATE','DELETE'];
begin
  foreach v_table in array array[
    'departments',
    'department_memberships',
    'workforce_tasks',
    'workforce_attendance',
    'staff_manager_nominations'
  ] loop
    v_relation := to_regclass('public.' || v_table);
    if v_relation is null then
      raise exception 'Missing workforce table: %', v_table;
    end if;

    if not (select relrowsecurity from pg_class where oid = v_relation) then
      raise exception 'RLS is disabled on workforce table: %', v_table;
    end if;

    if has_table_privilege('anon', v_relation, 'SELECT')
       or has_table_privilege('authenticated', v_relation, 'SELECT') then
      raise exception 'Client roles must not have direct SELECT on workforce table: %', v_table;
    end if;

    foreach v_privilege in array v_privileges loop
      if not has_table_privilege('service_role', v_relation, v_privilege) then
        raise exception 'service_role lacks % on workforce table: %', v_privilege, v_table;
      end if;
    end loop;
  end loop;

  if exists (
    select 1 from public.customer_profiles
    where public_id !~ '^eix:a[0-9a-z]{12}$'
  ) then
    raise exception 'Customer public ID format validation failed';
  end if;

  if exists (
    select 1 from public.staff_profiles
    where (role = 'supreme' and public_id <> 'supreme')
       or (role <> 'supreme' and public_id !~ '^eix:e[0-9a-z]{12}$')
  ) then
    raise exception 'Staff public ID format validation failed';
  end if;

  if exists (
    select public_id from public.customer_profiles group by public_id having count(*) > 1
  ) or exists (
    select public_id from public.staff_profiles group by public_id having count(*) > 1
  ) then
    raise exception 'Duplicate public IDs found';
  end if;

  if to_regclass('public.customer_profiles_public_id_uidx') is null
     or to_regclass('public.staff_profiles_public_id_uidx') is null
     or to_regclass('public.staff_profiles_single_supreme_uidx') is null then
    raise exception 'Required public identity unique indexes are missing';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'customer_profiles_public_id_guard' and not tgisinternal
  ) or not exists (
    select 1 from pg_trigger
    where tgname = 'staff_profiles_public_id_guard' and not tgisinternal
  ) then
    raise exception 'Public ID immutability triggers are missing';
  end if;

  if has_function_privilege('anon', 'public.neweix_generate_public_id(text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.neweix_generate_public_id(text)', 'EXECUTE') then
    raise exception 'Client roles must not execute the public ID generator';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.staff_profiles'::regclass
      and conname = 'staff_profiles_role_check'
      and pg_get_constraintdef(oid) ilike '%manager%'
      and pg_get_constraintdef(oid) ilike '%employee%'
  ) then
    raise exception 'Manager and Employee roles are not allowed by the staff role constraint';
  end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'department_memberships'
      and indexdef ilike '%unique index%'
      and indexdef ilike '%(user_id)%'
  ) then
    raise exception 'One-department-per-employee uniqueness is missing';
  end if;
end;
$$;

rollback;
