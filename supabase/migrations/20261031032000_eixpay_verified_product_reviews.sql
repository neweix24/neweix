-- Verified customer reviews with Supreme moderation and Eixon reward integration.
-- Reviews are tied to delivered, paid order items. Direct table access is never exposed.

create table if not exists private.eixpay_product_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete restrict,
  order_item_id uuid not null references public.order_items(id) on delete restrict,
  rating smallint not null check (rating between 1 and 5),
  title text not null check (char_length(title) between 3 and 120),
  body text not null check (char_length(body) between 20 and 2000),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  moderation_note text not null default '' check (char_length(moderation_note) <= 500),
  reward_awarded bigint not null default 0 check (reward_awarded >= 0),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint eixpay_product_review_order_item_unique unique (order_item_id)
);

create index if not exists eixpay_product_reviews_product_public_idx
  on private.eixpay_product_reviews (product_id, created_at desc)
  where status = 'approved';
create index if not exists eixpay_product_reviews_moderation_idx
  on private.eixpay_product_reviews (created_at asc)
  where status = 'pending';
create index if not exists eixpay_product_reviews_user_idx
  on private.eixpay_product_reviews (user_id, created_at desc);

alter table private.eixpay_product_reviews enable row level security;
revoke all on private.eixpay_product_reviews from public, anon, authenticated;

create or replace function public.eixpay_list_product_reviews(p_product_id uuid)
returns table (
  review_id uuid,
  rating smallint,
  title text,
  body text,
  reviewer_name text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $function$
  select r.id, r.rating, r.title, r.body,
    coalesce(nullif(cp.display_name, ''), 'NEWEIX ক্রেতা'),
    r.created_at
  from private.eixpay_product_reviews r
  left join public.customer_profiles cp on cp.user_id = r.user_id
  where r.product_id = p_product_id and r.status = 'approved'
  order by r.created_at desc
  limit 100;
$function$;

create or replace function public.eixpay_list_review_eligible_orders(p_product_id uuid)
returns table (
  order_item_id uuid,
  order_number text,
  product_name text,
  quantity integer,
  purchased_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'AUTHENTICATION_REQUIRED';
  end if;
  if p_product_id is null then
    raise exception using errcode = '22023', message = 'INVALID_PRODUCT';
  end if;

  return query
  select oi.id, o.order_number, oi.product_name, oi.quantity, o.updated_at
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where oi.product_id = p_product_id
    and o.customer_id = v_user_id
    and o.status = 'delivered'
    and o.payment_status = 'paid'
    and o.delivery_status not in ('returned','cancelled','failed')
    and o.delivered_at <= now() - interval '7 days'
    and o.delivery_fee_payment_status in ('paid','not_required')
    and not exists (
      select 1 from private.eixpay_product_reviews r
      where r.order_item_id = oi.id
    )
  order by o.updated_at desc
  limit 20;
end;
$function$;

create or replace function public.eixpay_submit_product_review(
  p_product_id uuid,
  p_order_item_id uuid,
  p_rating smallint,
  p_title text,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_order_id uuid;
  v_status text;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'AUTHENTICATION_REQUIRED';
  end if;
  if p_product_id is null or p_order_item_id is null
     or p_rating is null or p_rating < 1 or p_rating > 5
     or p_title is null or char_length(btrim(p_title)) < 3 or char_length(btrim(p_title)) > 120
     or p_body is null or char_length(btrim(p_body)) < 20 or char_length(btrim(p_body)) > 2000 then
    raise exception using errcode = '22023', message = 'INVALID_REVIEW';
  end if;

  select o.id, o.status
  into v_order_id, v_status
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where oi.id = p_order_item_id
    and oi.product_id = p_product_id
    and o.customer_id = v_user_id
    and o.status = 'delivered'
    and o.payment_status = 'paid'
    and o.delivery_status not in ('returned','cancelled','failed')
    and o.delivered_at <= now() - interval '7 days'
    and o.delivery_fee_payment_status in ('paid','not_required')
  for update of o;

  if not found then
    raise exception using errcode = '42501', message = 'VERIFIED_PURCHASE_REQUIRED';
  end if;

  insert into private.eixpay_product_reviews
    (user_id, product_id, order_id, order_item_id, rating, title, body)
  values
    (v_user_id, p_product_id, v_order_id, p_order_item_id, p_rating, btrim(p_title), btrim(p_body));

  return jsonb_build_object('success', true, 'status', 'pending', 'message', 'REVIEW_SUBMITTED_FOR_MODERATION');
exception
  when unique_violation then
    raise exception using errcode = '23505', message = 'REVIEW_ALREADY_SUBMITTED';
end;
$function$;

create or replace function public.eixpay_supreme_list_product_reviews()
returns table (
  review_id uuid,
  product_id uuid,
  product_name text,
  order_number text,
  reviewer_name text,
  reviewer_user_id uuid,
  rating smallint,
  title text,
  body text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception using errcode = '28000', message = 'AUTHENTICATION_REQUIRED';
  end if;
  if coalesce(auth.jwt() ->> 'aal','') <> 'aal2' or not exists (
    select 1 from public.staff_profiles
    where user_id = v_actor and role = 'supreme' and is_active = true
  ) then
    raise exception using errcode = '42501', message = 'SUPREME_MFA_REQUIRED';
  end if;

  return query
  select r.id, r.product_id, p.name, o.order_number,
    coalesce(nullif(cp.display_name,''), nullif(cp.full_name,''), 'NEWEIX ক্রেতা'),
    r.user_id, r.rating, r.title, r.body, r.created_at
  from private.eixpay_product_reviews r
  join public.products p on p.id = r.product_id
  join public.orders o on o.id = r.order_id
  left join public.customer_profiles cp on cp.user_id = r.user_id
  where r.status = 'pending'
  order by r.created_at asc
  limit 100;
end;
$function$;

create or replace function public.eixpay_supreme_decide_product_review(
  p_review_id uuid,
  p_decision text,
  p_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_review private.eixpay_product_reviews%rowtype;
  v_reward jsonb;
  v_awarded bigint := 0;
begin
  if v_actor is null then
    raise exception using errcode = '28000', message = 'AUTHENTICATION_REQUIRED';
  end if;
  if coalesce(auth.jwt() ->> 'aal','') <> 'aal2' or not exists (
    select 1 from public.staff_profiles
    where user_id = v_actor and role = 'supreme' and is_active = true
  ) then
    raise exception using errcode = '42501', message = 'SUPREME_MFA_REQUIRED';
  end if;
  if p_review_id is null or p_decision is null or p_decision not in ('approve','reject')
     or char_length(coalesce(p_note,'')) > 500 then
    raise exception using errcode = '22023', message = 'INVALID_REVIEW_DECISION';
  end if;

  select * into v_review
  from private.eixpay_product_reviews
  where id = p_review_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'REVIEW_NOT_FOUND';
  end if;
  if v_review.status <> 'pending' then
    raise exception using errcode = '55000', message = 'REVIEW_ALREADY_DECIDED';
  end if;

  if p_decision = 'approve' then
    v_reward := private.eixpay_apply_reward(
      v_review.user_id, 'verified_review', v_review.id,
      'verified-review:' || v_review.id::text, null, v_actor
    );
    if coalesce((v_reward ->> 'success')::boolean, false) then
      v_awarded := coalesce((v_reward ->> 'awarded')::bigint, 0);
    else
      raise exception using errcode = '55000',
        message = 'REVIEW_REWARD_NOT_AVAILABLE:' || coalesce(v_reward ->> 'reason','unknown');
    end if;
    update private.eixpay_product_reviews
    set status = 'approved', reward_awarded = v_awarded,
        moderation_note = coalesce(p_note,''), decided_at = now(),
        decided_by = v_actor, updated_at = now()
    where id = p_review_id;
  else
    update private.eixpay_product_reviews
    set status = 'rejected', moderation_note = coalesce(p_note,''),
        decided_at = now(), decided_by = v_actor, updated_at = now()
    where id = p_review_id;
  end if;

  insert into private.eixpay_audit_events(actor_id,event_code,subject_id,metadata)
  values (v_actor, 'product_review_' || p_decision, p_review_id,
    jsonb_build_object('user_id',v_review.user_id,'product_id',v_review.product_id,'rating',v_review.rating,'reward_awarded',v_awarded));

  return jsonb_build_object('success',true,'status',case when p_decision='approve' then 'approved' else 'rejected' end,'reward_awarded',v_awarded);
end;
$function$;

revoke all on function public.eixpay_list_product_reviews(uuid) from public, anon;
revoke all on function public.eixpay_list_review_eligible_orders(uuid) from public, anon;
revoke all on function public.eixpay_submit_product_review(uuid,uuid,smallint,text,text) from public, anon;
revoke all on function public.eixpay_supreme_list_product_reviews() from public, anon;
revoke all on function public.eixpay_supreme_decide_product_review(uuid,text,text) from public, anon;

grant execute on function public.eixpay_list_product_reviews(uuid) to anon, authenticated;
grant execute on function public.eixpay_list_review_eligible_orders(uuid) to authenticated;
grant execute on function public.eixpay_submit_product_review(uuid,uuid,smallint,text,text) to authenticated;
grant execute on function public.eixpay_supreme_list_product_reviews() to authenticated;
grant execute on function public.eixpay_supreme_decide_product_review(uuid,text,text) to authenticated;

