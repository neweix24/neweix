-- Customer address RPCs rely on the caller's existing table grants and RLS policies.
-- SECURITY INVOKER keeps those ownership policies in force instead of bypassing RLS.
begin;

alter function public.customer_save_address(
  uuid, text, text, text, text, text, text, text, text, text, boolean
) security invoker;

alter function public.customer_delete_address(uuid) security invoker;

commit;
