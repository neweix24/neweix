-- Record an expense and its audit event atomically.
begin;

create or replace function public.supreme_record_operating_expense(
  p_actor_id uuid,
  p_expense_date date,
  p_category text,
  p_amount integer,
  p_description text,
  p_vendor text default null,
  p_reference_number text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_expense public.operating_expenses%rowtype;
begin
  if not exists (
    select 1 from public.staff_profiles sp
     where sp.user_id = p_actor_id
       and sp.role = 'supreme'
       and sp.is_active = true
  ) then
    raise exception 'SUPREME_ACTOR_NOT_AUTHORIZED' using errcode = '42501';
  end if;

  insert into public.operating_expenses (
    expense_date, category, amount, description, vendor, reference_number, created_by
  ) values (
    p_expense_date, p_category, p_amount, pg_catalog.btrim(p_description),
    nullif(pg_catalog.btrim(p_vendor), ''),
    nullif(pg_catalog.btrim(p_reference_number), ''),
    p_actor_id
  )
  returning * into v_expense;

  insert into public.audit_logs(actor_id, action, target_type, target_id, details)
  values (
    p_actor_id,
    'finance.expense.created',
    'operating_expense',
    v_expense.id::text,
    pg_catalog.jsonb_build_object(
      'category', v_expense.category,
      'amount', v_expense.amount,
      'expense_date', v_expense.expense_date
    )
  );

  return pg_catalog.jsonb_build_object(
    'id', v_expense.id,
    'expense_date', v_expense.expense_date,
    'category', v_expense.category,
    'amount', v_expense.amount,
    'description', v_expense.description,
    'vendor', v_expense.vendor,
    'reference_number', v_expense.reference_number,
    'created_at', v_expense.created_at
  );
end;
$function$;

revoke all on function public.supreme_record_operating_expense(uuid, date, text, integer, text, text, text)
  from public, anon, authenticated;
grant execute on function public.supreme_record_operating_expense(uuid, date, text, integer, text, text, text)
  to service_role;

commit;
