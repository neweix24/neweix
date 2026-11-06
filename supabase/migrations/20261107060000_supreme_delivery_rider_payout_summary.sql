-- Exact lifetime payout totals for each NEWEIX delivery rider.
begin;
create or replace function public.supreme_delivery_rider_payout_summary()
returns table(rider_id uuid,total_paid numeric,payment_count bigint)
language sql stable security definer set search_path = ''
as $function$
  select d.rider_id,
         coalesce(sum(case when d.entry_kind='refund' then -d.amount else d.amount end),0)::numeric(14,2),
         count(*)::bigint
  from public.delivery_cost_entries d
  where d.provider='neweix_own'
    and d.cost_type='rider_payment'
    and d.rider_id is not null
  group by d.rider_id;
$function$;
revoke all on function public.supreme_delivery_rider_payout_summary() from public,anon,authenticated,service_role;
grant execute on function public.supreme_delivery_rider_payout_summary() to service_role;
commit;
