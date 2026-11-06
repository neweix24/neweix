-- Supreme-only manual attendance records for NEWEIX own-delivery riders.
begin;

create table if not exists public.neweix_delivery_rider_attendance (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references public.neweix_delivery_riders(id) on delete restrict,
  work_date date not null,
  attendance_status text not null
    check (attendance_status in ('present','late','half_day','absent','leave')),
  check_in_at timestamptz,
  check_out_at timestamptz,
  notes text check (notes is null or char_length(btrim(notes)) <= 500),
  recorded_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint neweix_rider_attendance_one_per_day unique (rider_id, work_date),
  constraint neweix_rider_attendance_time_order check (
    check_in_at is null or check_out_at is null or check_out_at >= check_in_at
  ),
  constraint neweix_rider_attendance_status_times check (
    (attendance_status in ('absent','leave') and check_in_at is null and check_out_at is null)
    or
    (attendance_status in ('present','late','half_day') and check_in_at is not null)
  ),
  constraint neweix_rider_attendance_checkin_local_date check (
    check_in_at is null or (check_in_at at time zone 'Asia/Dhaka')::date = work_date
  ),
  constraint neweix_rider_attendance_checkout_local_date check (
    check_out_at is null or (check_out_at at time zone 'Asia/Dhaka')::date = work_date
  )
);

create index if not exists neweix_rider_attendance_date_idx
  on public.neweix_delivery_rider_attendance(work_date desc, rider_id);

alter table public.neweix_delivery_rider_attendance enable row level security;
revoke all on public.neweix_delivery_rider_attendance from public, anon, authenticated, service_role;
grant select, insert, update on public.neweix_delivery_rider_attendance to service_role;

create or replace function public.supreme_record_delivery_rider_attendance(
  p_actor_id uuid,
  p_rider_id uuid,
  p_work_date date,
  p_attendance_status text,
  p_check_in_at timestamptz default null,
  p_check_out_at timestamptz default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_row public.neweix_delivery_rider_attendance%rowtype;
  v_old public.neweix_delivery_rider_attendance%rowtype;
begin
  if not exists (
    select 1 from public.staff_profiles
    where user_id = p_actor_id and role = 'supreme' and is_active = true
  ) then
    raise exception 'SUPREME_ACTOR_NOT_AUTHORIZED';
  end if;

  if p_work_date is null or p_work_date > (now() at time zone 'Asia/Dhaka')::date
     or p_attendance_status not in ('present','late','half_day','absent','leave')
     or (p_notes is not null and char_length(btrim(p_notes)) > 500)
     or (p_check_in_at is not null and (p_check_in_at at time zone 'Asia/Dhaka')::date <> p_work_date)
     or (p_check_out_at is not null and (p_check_out_at at time zone 'Asia/Dhaka')::date <> p_work_date)
     or (p_check_in_at is not null and p_check_out_at is not null and p_check_out_at < p_check_in_at)
     or (p_attendance_status in ('absent','leave') and (p_check_in_at is not null or p_check_out_at is not null))
     or (p_attendance_status in ('present','late','half_day') and p_check_in_at is null) then
    raise exception 'INVALID_RIDER_ATTENDANCE_INPUT';
  end if;

  if not exists (
    select 1 from public.neweix_delivery_riders
    where id = p_rider_id
  ) then
    raise exception 'DELIVERY_RIDER_NOT_FOUND';
  end if;

  select * into v_old
  from public.neweix_delivery_rider_attendance
  where rider_id = p_rider_id and work_date = p_work_date;

  insert into public.neweix_delivery_rider_attendance(
    rider_id, work_date, attendance_status, check_in_at, check_out_at, notes, recorded_by
  ) values (
    p_rider_id, p_work_date, p_attendance_status, p_check_in_at, p_check_out_at,
    nullif(btrim(p_notes), ''), p_actor_id
  )
  on conflict (rider_id, work_date) do update set
    attendance_status = excluded.attendance_status,
    check_in_at = excluded.check_in_at,
    check_out_at = excluded.check_out_at,
    notes = excluded.notes,
    recorded_by = excluded.recorded_by,
    updated_at = now()
  returning * into v_row;

  insert into public.audit_logs(actor_id, action, target_type, target_id, details)
  values (
    p_actor_id,
    case when v_old.id is null then 'delivery.rider.attendance.recorded' else 'delivery.rider.attendance.updated' end,
    'delivery_rider_attendance',
    v_row.id,
    jsonb_build_object(
      'rider_id', p_rider_id,
      'work_date', p_work_date,
      'status', p_attendance_status,
      'check_in_at', p_check_in_at,
      'check_out_at', p_check_out_at
    )
  );

  return jsonb_build_object(
    'id', v_row.id,
    'rider_id', v_row.rider_id,
    'work_date', v_row.work_date,
    'attendance_status', v_row.attendance_status,
    'check_in_at', v_row.check_in_at,
    'check_out_at', v_row.check_out_at
  );
end;
$function$;

revoke all on function public.supreme_record_delivery_rider_attendance(uuid,uuid,date,text,timestamp with time zone,timestamp with time zone,text)
  from public, anon, authenticated, service_role;
grant execute on function public.supreme_record_delivery_rider_attendance(uuid,uuid,date,text,timestamp with time zone,timestamp with time zone,text)
  to service_role;

comment on table public.neweix_delivery_rider_attendance is
  'Supreme-managed manual attendance records for NEWEIX own-delivery riders. One record per rider per Bangladesh-local work date.';
comment on function public.supreme_record_delivery_rider_attendance(uuid,uuid,date,text,timestamp with time zone,timestamp with time zone,text) is
  'Records or updates one rider attendance entry. Callable only by the server-side service role after Supreme MFA authorization.';

commit;
