-- Track rider assignment history and provide date-scoped operational performance reports.
begin;

create table if not exists public.neweix_delivery_rider_assignments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  rider_id uuid not null references public.neweix_delivery_riders(id) on delete restrict,
  assigned_at timestamptz not null default clock_timestamp(),
  ended_at timestamptz,
  assigned_by uuid references auth.users(id) on delete restrict,
  ended_by uuid references auth.users(id) on delete restrict,
  assignment_source text not null default 'tracked'
    check (assignment_source in ('tracked','legacy_snapshot')),
  created_at timestamptz not null default now(),
  constraint neweix_rider_assignment_time_check check (ended_at is null or ended_at >= assigned_at)
);

create unique index if not exists neweix_rider_one_open_assignment_per_order_uidx
  on public.neweix_delivery_rider_assignments(order_id)
  where ended_at is null;
create index if not exists neweix_rider_assignments_rider_date_idx
  on public.neweix_delivery_rider_assignments(rider_id, assigned_at desc);
create index if not exists neweix_rider_assignments_order_time_idx
  on public.neweix_delivery_rider_assignments(order_id, assigned_at desc);

alter table public.neweix_delivery_rider_assignments enable row level security;
revoke all on public.neweix_delivery_rider_assignments from public,anon,authenticated,service_role;
grant select,insert,update on public.neweix_delivery_rider_assignments to service_role;

-- Preserve the current rider on older orders as a clearly marked snapshot.
-- It is excluded from time-based performance metrics because the true assignment
-- timestamp was not stored before this migration.
insert into public.neweix_delivery_rider_assignments(order_id,rider_id,assigned_at,assignment_source)
select o.id,o.neweix_delivery_rider_id,o.created_at,'legacy_snapshot'
from public.orders o
where o.delivery_provider='neweix_own'
  and o.neweix_delivery_rider_id is not null
  and not exists (
    select 1 from public.neweix_delivery_rider_assignments a
    where a.order_id=o.id and a.ended_at is null
  )
on conflict do nothing;

create or replace function private.track_neweix_delivery_rider_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_text text := nullif(current_setting('app.supreme_actor_id',true),'');
  v_actor uuid;
begin
  if v_actor_text is not null then
    v_actor := v_actor_text::uuid;
  end if;

  if tg_op='UPDATE' then
    if new.neweix_delivery_rider_id is not distinct from old.neweix_delivery_rider_id then
      return new;
    end if;
    update public.neweix_delivery_rider_assignments
      set ended_at=clock_timestamp(), ended_by=v_actor
      where order_id=old.id and ended_at is null;
  end if;

  if new.neweix_delivery_rider_id is not null then
    insert into public.neweix_delivery_rider_assignments(
      order_id,rider_id,assigned_at,assigned_by,assignment_source
    ) values (
      new.id,new.neweix_delivery_rider_id,clock_timestamp(),v_actor,'tracked'
    );
  end if;
  return new;
end;
$function$;

revoke all on function private.track_neweix_delivery_rider_assignment()
  from public,anon,authenticated,service_role;

drop trigger if exists track_neweix_delivery_rider_assignment on public.orders;
create trigger track_neweix_delivery_rider_assignment
after insert or update of neweix_delivery_rider_id on public.orders
for each row execute function private.track_neweix_delivery_rider_assignment();

create or replace function public.supreme_assign_delivery_rider(
  p_actor_id uuid, p_order_id uuid, p_rider_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_order public.orders%rowtype;
  v_rider public.neweix_delivery_riders%rowtype;
begin
  if not exists (
    select 1 from public.staff_profiles
    where user_id=p_actor_id and role='supreme' and is_active=true
  ) then
    raise exception 'SUPREME_ACTOR_NOT_AUTHORIZED';
  end if;

  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'DELIVERY_ORDER_NOT_FOUND'; end if;
  if v_order.delivery_provider <> 'neweix_own' then raise exception 'NOT_NEWEIX_OWN_DELIVERY'; end if;
  if v_order.status in ('cancelled','returned') or v_order.payment_status='refunded' then
    raise exception 'DELIVERY_ORDER_TERMINAL';
  end if;
  if v_order.delivered_at is not null then raise exception 'DELIVERY_ALREADY_COMPLETED'; end if;

  select * into v_rider
  from public.neweix_delivery_riders
  where id=p_rider_id and is_active=true
  for share;
  if not found then raise exception 'DELIVERY_RIDER_NOT_ACTIVE'; end if;

  if v_order.neweix_delivery_rider_id is distinct from p_rider_id then
    perform set_config('app.supreme_actor_id',p_actor_id::text,true);
    update public.orders
      set neweix_delivery_rider_id=p_rider_id
      where id=p_order_id;
  end if;

  insert into public.audit_logs(actor_id,action,target_type,target_id,details)
  values(p_actor_id,'delivery.rider.assigned','order',p_order_id,
    jsonb_build_object('rider_id',p_rider_id,'rider_code',v_rider.rider_code));

  return jsonb_build_object('order_id',p_order_id,'rider_id',p_rider_id,'rider_code',v_rider.rider_code);
end;
$function$;

revoke all on function public.supreme_assign_delivery_rider(uuid,uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.supreme_assign_delivery_rider(uuid,uuid,uuid)
  to service_role;

create or replace function public.supreme_delivery_rider_daily_report(
  p_start_date date,
  p_end_date date
)
returns table(
  rider_id uuid,
  rider_code text,
  rider_name text,
  is_active boolean,
  assigned_orders bigint,
  delivered_orders bigint,
  pending_orders bigint,
  failed_orders bigint,
  payout_amount numeric,
  average_delivery_minutes numeric
)
language sql
stable
security definer
set search_path = ''
as $function$
  with assignment_stats as (
    select
      a.rider_id,
      count(*) filter (
        where a.assignment_source='tracked'
          and (a.assigned_at at time zone 'Asia/Dhaka')::date between p_start_date and p_end_date
      )::bigint as assigned_orders,
      count(*) filter (
        where a.assignment_source='tracked'
          and o.delivered_at is not null
          and o.delivered_at >= a.assigned_at
          and (a.ended_at is null or o.delivered_at < a.ended_at)
          and (o.delivered_at at time zone 'Asia/Dhaka')::date between p_start_date and p_end_date
      )::bigint as delivered_orders,
      count(*) filter (
        where a.ended_at is null
          and o.delivered_at is null
          and o.status not in ('cancelled','returned')
          and o.payment_status <> 'refunded'
      )::bigint as pending_orders,
      count(*) filter (
        where a.assignment_source='tracked'
          and o.delivery_status='failed'
          and (a.assigned_at at time zone 'Asia/Dhaka')::date between p_start_date and p_end_date
      )::bigint as failed_orders,
      avg(extract(epoch from (o.delivered_at-a.assigned_at))/60.0) filter (
        where a.assignment_source='tracked'
          and o.delivered_at is not null
          and o.delivered_at >= a.assigned_at
          and (a.ended_at is null or o.delivered_at < a.ended_at)
          and (o.delivered_at at time zone 'Asia/Dhaka')::date between p_start_date and p_end_date
      )::numeric(12,2) as average_delivery_minutes
    from public.neweix_delivery_rider_assignments a
    join public.orders o on o.id=a.order_id
    where a.assignment_source='tracked'
      and (
        (a.assigned_at at time zone 'Asia/Dhaka')::date between p_start_date and p_end_date
        or (o.delivered_at at time zone 'Asia/Dhaka')::date between p_start_date and p_end_date
        or (a.ended_at is null and o.delivered_at is null)
      )
    group by a.rider_id
  ),
  payout_stats as (
    select d.rider_id,
      coalesce(sum(case when d.entry_kind='refund' then -d.amount else d.amount end),0)::numeric(14,2) as payout_amount
    from public.delivery_cost_entries d
    where d.provider='neweix_own'
      and d.cost_type='rider_payment'
      and d.rider_id is not null
      and d.cost_date between p_start_date and p_end_date
    group by d.rider_id
  )
  select
    r.id,r.rider_code,r.full_name,r.is_active,
    coalesce(a.assigned_orders,0),
    coalesce(a.delivered_orders,0),
    coalesce(a.pending_orders,0),
    coalesce(a.failed_orders,0),
    coalesce(p.payout_amount,0),
    a.average_delivery_minutes
  from public.neweix_delivery_riders r
  left join assignment_stats a on a.rider_id=r.id
  left join payout_stats p on p.rider_id=r.id
  order by coalesce(a.delivered_orders,0) desc, r.full_name asc;
$function$;

revoke all on function public.supreme_delivery_rider_daily_report(date,date)
  from public,anon,authenticated,service_role;
grant execute on function public.supreme_delivery_rider_daily_report(date,date)
  to service_role;

comment on table public.neweix_delivery_rider_assignments is
  'Assignment history for NEWEIX own-delivery riders. Legacy snapshots are retained but excluded from verified time-based performance.';
comment on function public.supreme_delivery_rider_daily_report(date,date) is
  'Date-scoped rider performance using tracked assignment timestamps, actual delivered_at timestamps and recorded rider payouts.';

commit;
