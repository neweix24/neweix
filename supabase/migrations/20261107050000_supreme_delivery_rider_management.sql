-- Supreme-managed NEWEIX delivery rider directory, order assignment and payout attribution.
begin;

create table if not exists public.neweix_delivery_riders (
  id uuid primary key default gen_random_uuid(),
  rider_code text not null unique,
  full_name text not null check (char_length(btrim(full_name)) between 2 and 120),
  phone text not null,
  is_active boolean not null default true,
  notes text check (notes is null or char_length(btrim(notes)) <= 500),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint neweix_delivery_rider_phone_check check (phone ~ '^[+0-9 ()-]{8,24}$')
);

create unique index if not exists neweix_delivery_rider_phone_uidx
  on public.neweix_delivery_riders(regexp_replace(phone, '[^0-9]', '', 'g'));

alter table public.neweix_delivery_riders enable row level security;
revoke all on public.neweix_delivery_riders from public, anon, authenticated, service_role;
grant select, insert, update on public.neweix_delivery_riders to service_role;

alter table public.orders
  add column if not exists neweix_delivery_rider_id uuid
  references public.neweix_delivery_riders(id) on delete restrict;
create index if not exists orders_neweix_delivery_rider_idx
  on public.orders(neweix_delivery_rider_id, created_at desc)
  where neweix_delivery_rider_id is not null;

alter table public.delivery_cost_entries
  add column if not exists rider_id uuid
  references public.neweix_delivery_riders(id) on delete restrict;
create index if not exists delivery_cost_entries_rider_date_idx
  on public.delivery_cost_entries(rider_id, cost_date desc)
  where rider_id is not null;

create or replace function public.supreme_create_delivery_rider(
  p_actor_id uuid, p_full_name text, p_phone text, p_notes text default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $function$
declare v_rider public.neweix_delivery_riders%rowtype; v_code text;
begin
  if not exists (select 1 from public.staff_profiles where user_id=p_actor_id and role='supreme' and is_active=true) then
    raise exception 'SUPREME_ACTOR_NOT_AUTHORIZED';
  end if;
  if p_full_name is null or char_length(btrim(p_full_name)) not between 2 and 120
     or p_phone is null or p_phone !~ '^[+0-9 ()-]{8,24}$'
     or (p_notes is not null and char_length(btrim(p_notes)) > 500) then
    raise exception 'INVALID_DELIVERY_RIDER_INPUT';
  end if;
  v_code := 'NXR-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
  insert into public.neweix_delivery_riders(rider_code,full_name,phone,notes,created_by)
  values(v_code,btrim(p_full_name),btrim(p_phone),nullif(btrim(p_notes),''),p_actor_id)
  returning * into v_rider;
  insert into public.audit_logs(actor_id,action,target_type,target_id,details)
  values(p_actor_id,'delivery.rider.created','delivery_rider',v_rider.id,
    jsonb_build_object('rider_code',v_rider.rider_code,'full_name',v_rider.full_name));
  return jsonb_build_object('id',v_rider.id,'rider_code',v_rider.rider_code,'full_name',v_rider.full_name,'phone',v_rider.phone,'is_active',v_rider.is_active);
end;
$function$;

create or replace function public.supreme_assign_delivery_rider(
  p_actor_id uuid, p_order_id uuid, p_rider_id uuid
)
returns jsonb
language plpgsql security definer set search_path = ''
as $function$
declare v_order public.orders%rowtype; v_rider public.neweix_delivery_riders%rowtype;
begin
  if not exists (select 1 from public.staff_profiles where user_id=p_actor_id and role='supreme' and is_active=true) then
    raise exception 'SUPREME_ACTOR_NOT_AUTHORIZED';
  end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'DELIVERY_ORDER_NOT_FOUND'; end if;
  if v_order.delivery_provider <> 'neweix_own' then raise exception 'NOT_NEWEIX_OWN_DELIVERY'; end if;
  if v_order.status in ('cancelled','returned','refunded') then raise exception 'DELIVERY_ORDER_TERMINAL'; end if;
  select * into v_rider from public.neweix_delivery_riders where id=p_rider_id and is_active=true for share;
  if not found then raise exception 'DELIVERY_RIDER_NOT_ACTIVE'; end if;
  update public.orders set neweix_delivery_rider_id=p_rider_id where id=p_order_id;
  insert into public.audit_logs(actor_id,action,target_type,target_id,details)
  values(p_actor_id,'delivery.rider.assigned','order',p_order_id,
    jsonb_build_object('rider_id',p_rider_id,'rider_code',v_rider.rider_code));
  return jsonb_build_object('order_id',p_order_id,'rider_id',p_rider_id,'rider_code',v_rider.rider_code);
end;
$function$;

create or replace function public.supreme_record_rider_payment(
  p_actor_id uuid, p_order_id uuid, p_rider_id uuid, p_amount numeric,
  p_cost_date date, p_source_type text, p_source_reference text default null, p_notes text default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $function$
declare v_entry public.delivery_cost_entries%rowtype;
begin
  if not exists (select 1 from public.staff_profiles where user_id=p_actor_id and role='supreme' and is_active=true) then
    raise exception 'SUPREME_ACTOR_NOT_AUTHORIZED';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > 1000000000 or p_amount <> round(p_amount,2)
     or p_cost_date is null or p_source_type not in ('manual_receipt','cashbook','other')
     or (p_source_reference is not null and char_length(btrim(p_source_reference)) > 160)
     or (p_notes is not null and char_length(btrim(p_notes)) > 1000) then
    raise exception 'INVALID_RIDER_PAYMENT_INPUT';
  end if;
  if not exists(select 1 from public.orders where id=p_order_id and delivery_provider='neweix_own' and neweix_delivery_rider_id=p_rider_id) then
    raise exception 'RIDER_ORDER_ASSIGNMENT_MISMATCH';
  end if;
  if not exists(select 1 from public.neweix_delivery_riders where id=p_rider_id) then
    raise exception 'DELIVERY_RIDER_NOT_FOUND';
  end if;
  insert into public.delivery_cost_entries(order_id,provider,cost_type,entry_kind,amount,cost_date,source_type,source_reference,notes,recorded_by,rider_id)
  values(p_order_id,'neweix_own','rider_payment','charge',p_amount,p_cost_date,p_source_type,nullif(btrim(p_source_reference),''),nullif(btrim(p_notes),''),p_actor_id,p_rider_id)
  returning * into v_entry;
  insert into public.audit_logs(actor_id,action,target_type,target_id,details)
  values(p_actor_id,'delivery.rider.payment.recorded','delivery_cost_entry',v_entry.id,
    jsonb_build_object('order_id',p_order_id,'rider_id',p_rider_id,'amount',p_amount,'cost_date',p_cost_date));
  return jsonb_build_object('id',v_entry.id,'order_id',p_order_id,'rider_id',p_rider_id,'amount',v_entry.amount,'cost_date',v_entry.cost_date);
end;
$function$;

revoke all on function public.supreme_create_delivery_rider(uuid,text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.supreme_assign_delivery_rider(uuid,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.supreme_record_rider_payment(uuid,uuid,uuid,numeric,date,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.supreme_create_delivery_rider(uuid,text,text,text) to service_role;
grant execute on function public.supreme_assign_delivery_rider(uuid,uuid,uuid) to service_role;
grant execute on function public.supreme_record_rider_payment(uuid,uuid,uuid,numeric,date,text,text,text) to service_role;

commit;
