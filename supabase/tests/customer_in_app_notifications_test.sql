-- Regression tests for customer in-app notification access boundaries.
do $$
begin
  if not has_table_privilege('authenticated', 'public.customer_notifications', 'SELECT') then
    raise exception 'NOTIFICATION REGRESSION: authenticated cannot read own notifications';
  end if;
  if not has_column_privilege('authenticated', 'public.customer_notifications', 'read_at', 'UPDATE') then
    raise exception 'NOTIFICATION REGRESSION: authenticated cannot mark notifications as read';
  end if;
  if has_column_privilege('authenticated', 'public.customer_notifications', 'user_id', 'UPDATE')
     or has_column_privilege('authenticated', 'public.customer_notifications', 'order_id', 'UPDATE')
     or has_column_privilege('authenticated', 'public.customer_notifications', 'title', 'UPDATE')
     or has_column_privilege('authenticated', 'public.customer_notifications', 'body', 'UPDATE') then
    raise exception 'SECURITY REGRESSION: authenticated can modify notification ownership or content';
  end if;
  if has_table_privilege('authenticated', 'public.customer_notifications', 'INSERT')
     or has_table_privilege('authenticated', 'public.customer_notifications', 'DELETE') then
    raise exception 'SECURITY REGRESSION: authenticated can create or delete notification records';
  end if;
  if has_table_privilege('anon', 'public.customer_notifications', 'SELECT') then
    raise exception 'SECURITY REGRESSION: anon can read customer notifications';
  end if;
  if has_function_privilege('authenticated', 'private.create_customer_in_app_notifications()', 'EXECUTE') then
    raise exception 'SECURITY REGRESSION: authenticated can execute internal notification trigger function';
  end if;
end;
$$;
