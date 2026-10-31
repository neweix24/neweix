-- EixVerse referral attribution and Eixon rewards.
-- A referral is only attributed to a newly created customer and rewards only
-- after the referred customer's first eligible order clears the return window.

create table if not exists private.eixpay_referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_user_id uuid not null references auth.users(id) on delete cascade,
  referred_user_id uuid not null references auth.users(id) on delete cascade,
  referral_code text not null,
  status text not null default 'pending'
    check (status in ('pending','qualified','rewarded','rejected')),
  qualifying_order_id uuid references public.orders(id) on delete set null,
  created_at timestamptz not null default now(),
  qualified_at timestamptz,
  rewarded_at timestamptz,
  constraint eixpay_referral_not_self check (referrer_user_id <> referred_user_id),
  constraint eixpay_referral_one_inviter_per_user unique (referred_user_id),
  constraint eixpay_referral_one_qualifying_order unique (qualifying_order_id)
);

create index if not exists eixpay_referrals_referrer_created_idx
  on private.eixpay_referrals (referrer_user_id, created_at desc);
create index if not exists eixpay_referrals_qualified_idx
  on private.eixpay_referrals (qualified_at asc)
  where status = 'qualified';

alter table private.eixpay_referrals enable row level security;
revoke all on private.eixpay_referrals from public, anon, authenticated;

create or replace function public.eixpay_apply_referral_code(p_referral_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_referrer_id uuid;
  v_created_at timestamptz;
  v_today_count integer;
  v_invitee_email text;
  v_referrer_email text;
  v_invitee_phone text;
  v_referrer_phone text;
  v_code text := upper(btrim(coalesce(p_referral_code,'')));
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'AUTHENTICATION_REQUIRED';
  end if;
  if v_code !~ '^EIX-[A-F0-9]{8}$' then
    raise exception using errcode = '22023', message = 'INVALID_REFERRAL_CODE';
  end if;

  select created_at, lower(email) into v_created_at, v_invitee_email
  from auth.users where id = v_user_id;

  if v_created_at is null or v_created_at < now() - interval '24 hours' then
    return jsonb_build_object('success', false, 'reason', 'REFERRAL_WINDOW_EXPIRED');
  end if;

  select user_id into v_referrer_id
  from private.eixpay_wallets
  where eix_id = v_code;

  if v_referrer_id is null or v_referrer_id = v_user_id then
    raise exception using errcode = '22023', message = 'INVALID_REFERRAL_CODE';
  end if;

  select lower(email) into v_referrer_email from auth.users where id = v_referrer_id;
  select regexp_replace(coalesce(phone,''), '\D', '', 'g') into v_invitee_phone
  from public.customer_profiles where user_id = v_user_id;
  select regexp_replace(coalesce(phone,''), '\D', '', 'g') into v_referrer_phone
  from public.customer_profiles where user_id = v_referrer_id;

  if v_invitee_email is not null and v_invitee_email = v_referrer_email
     or v_invitee_phone is not null and v_invitee_phone <> '' and v_invitee_phone = v_referrer_phone then
    raise exception using errcode = '22023', message = 'SELF_REFERRAL_NOT_ALLOWED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  if exists (select 1 from private.eixpay_referrals where referred_user_id = v_user_id) then
    return jsonb_build_object('success', true, 'duplicate', true);
  end if;

  select count(*) into v_today_count
  from private.eixpay_referrals
  where referrer_user_id = v_referrer_id
    and created_at >= (date_trunc('day', now() at time zone 'Asia/Dhaka') at time zone 'Asia/Dhaka');

  if v_today_count >= 10 then
    raise exception using errcode = '55000', message = 'REFERRAL_DAILY_LIMIT_REACHED';
  end if;

  insert into private.eixpay_referrals (referrer_user_id, referred_user_id, referral_code)
  values (v_referrer_id, v_user_id, v_code);

  insert into private.eixpay_audit_events (actor_id, event_code, subject_id, metadata)
  values (v_user_id, 'referral_code_applied', v_user_id,
    jsonb_build_object('referrer_user_id', v_referrer_id, 'referral_code', v_code));

  return jsonb_build_object('success', true, 'status', 'pending');
end;
$function$;

create or replace function public.eixpay_get_referral_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_pending integer;
  v_qualified integer;
  v_rewarded integer;
  v_total integer;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'AUTHENTICATION_REQUIRED';
  end if;
  select
    count(*)::integer,
    count(*) filter (where status = 'pending')::integer,
    count(*) filter (where status = 'qualified')::integer,
    count(*) filter (where status = 'rewarded')::integer
  into v_total, v_pending, v_qualified, v_rewarded
  from private.eixpay_referrals
  where referrer_user_id = v_user_id;

  return jsonb_build_object(
    'total_invited', coalesce(v_total,0),
    'pending', coalesce(v_pending,0),
    'qualified', coalesce(v_qualified,0),
    'rewarded', coalesce(v_rewarded,0)
  );
end;
$function$;

create or replace function private.eixpay_qualify_referral_for_order(
  p_order_id uuid,
  p_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_referral_id uuid;
begin
  if p_order_id is null or p_user_id is null then return false; end if;

  update private.eixpay_referrals r
  set status = 'qualified',
      qualifying_order_id = p_order_id,
      qualified_at = now()
  from public.orders o
  where r.referred_user_id = p_user_id
    and r.status = 'pending'
    and o.id = p_order_id
    and o.customer_id = p_user_id
    and o.status = 'delivered'
    and o.payment_status = 'paid'
    and o.delivery_fee_payment_status in ('paid','not_required')
    and o.delivered_at is not null
    and o.delivered_at <= now() - interval '7 days'
  returning r.id into v_referral_id;

  return v_referral_id is not null;
end;
$function$;

create or replace function private.eixpay_process_qualified_referral_rewards()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_referral private.eixpay_referrals%rowtype;
  v_referrer_reward jsonb;
  v_invitee_reward jsonb;
  v_processed integer := 0;
begin
  for v_referral in
    select r.*
    from private.eixpay_referrals r
    join public.customer_profiles rp on rp.user_id = r.referrer_user_id and rp.phone_verified_at is not null
    join public.customer_profiles ip on ip.user_id = r.referred_user_id and ip.phone_verified_at is not null
    join auth.users ru on ru.id = r.referrer_user_id
    join auth.users iu on iu.id = r.referred_user_id
    where r.status = 'qualified'
      and lower(coalesce(ru.email,'')) <> lower(coalesce(iu.email,''))
      and regexp_replace(coalesce(rp.phone,''), '\D', '', 'g') <> ''
      and regexp_replace(coalesce(rp.phone,''), '\D', '', 'g') <> regexp_replace(coalesce(ip.phone,''), '\D', '', 'g')
    order by r.qualified_at asc
    for update of r skip locked
    limit 100
  loop
    begin
      v_referrer_reward := private.eixpay_apply_reward(
        v_referral.referrer_user_id, 'approved_referral', v_referral.id,
        'referral-referrer:' || v_referral.id::text, null, null
      );
      v_invitee_reward := private.eixpay_apply_reward(
        v_referral.referred_user_id, 'approved_referral', v_referral.id,
        'referral-invitee:' || v_referral.id::text, null, null
      );

      if coalesce((v_referrer_reward ->> 'success')::boolean, false)
         and coalesce((v_invitee_reward ->> 'success')::boolean, false) then
        update private.eixpay_referrals
        set status = 'rewarded', rewarded_at = now()
        where id = v_referral.id;
        insert into private.eixpay_audit_events(actor_id,event_code,subject_id,metadata)
        values (null, 'referral_rewards_issued', v_referral.id,
          jsonb_build_object('referrer_user_id',v_referral.referrer_user_id,'referred_user_id',v_referral.referred_user_id,'order_id',v_referral.qualifying_order_id));
        v_processed := v_processed + 1;
      end if;
    exception when others then
      -- Keep this referral qualified; a later scheduled run may retry safely.
      null;
    end;
  end loop;
  return v_processed;
end;
$function$;

-- The order reward worker also marks a referral qualified after the first
-- eligible order reward has been successfully settled.
create or replace function private.eixpay_process_due_order_rewards()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_task private.eixpay_order_reward_queue%rowtype;
  v_result jsonb;
  v_processed integer := 0;
begin
  for v_task in
    select *
    from private.eixpay_order_reward_queue
    where status in ('pending', 'blocked') and eligible_at <= now()
    order by eligible_at asc
    for update skip locked
    limit 100
  loop
    v_result := private.eixpay_apply_reward(
      v_task.user_id,
      'delivered_order',
      v_task.order_id,
      'order-delivered:' || v_task.order_id::text,
      v_task.reward_amount_snapshot,
      null
    );

    if coalesce((v_result ->> 'success')::boolean, false) then
      if coalesce((v_result ->> 'duplicate')::boolean, false) then
        update private.eixpay_order_reward_queue
        set status = 'awarded', awarded_at = coalesce(awarded_at, now()),
            last_attempt_at = now(), last_result = 'duplicate_claim_already_exists'
        where order_id = v_task.order_id;
      else
        update private.eixpay_order_reward_queue
        set status = 'awarded', awarded_at = now(),
            last_attempt_at = now(), last_result = 'reward_awarded'
        where order_id = v_task.order_id;
      end if;
      perform private.eixpay_qualify_referral_for_order(v_task.order_id, v_task.user_id);
      v_processed := v_processed + 1;
    else
      update private.eixpay_order_reward_queue
      set status = 'blocked',
          eligible_at = now() + interval '1 day',
          last_attempt_at = now(),
          last_result = coalesce(v_result ->> 'reason', 'reward_not_awarded')
      where order_id = v_task.order_id;
    end if;
  end loop;

  return v_processed;
end;
$function$;

alter table private.eixpay_referrals
  drop constraint if exists eixpay_referrals_status_check;
alter table private.eixpay_referrals
  add constraint eixpay_referrals_status_check
  check (status in ('pending','qualified','rewarded','rejected','reversed'));

create or replace function private.eixpay_reverse_referral_for_order(
  p_order_id uuid,
  p_referred_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_referral private.eixpay_referrals%rowtype;
  v_user_id uuid;
  v_claim private.eixpay_reward_claims%rowtype;
  v_reversal_id uuid;
  v_balance bigint;
  v_debt bigint;
  v_deduct bigint;
  v_debt_added bigint;
  v_new_balance bigint;
  v_reversed integer := 0;
begin
  select * into v_referral
  from private.eixpay_referrals
  where qualifying_order_id = p_order_id
    and referred_user_id = p_referred_user_id
  for update;

  if not found then
    return jsonb_build_object('success',true,'reversed',false,'reason','no_qualified_referral');
  end if;

  if v_referral.status = 'reversed' or v_referral.status = 'rejected' then
    return jsonb_build_object('success',true,'duplicate',true);
  end if;

  foreach v_user_id in array array[v_referral.referrer_user_id,v_referral.referred_user_id]
  loop
    select * into v_claim
    from private.eixpay_reward_claims
    where user_id = v_user_id
      and event_code = 'approved_referral'
      and source_id = v_referral.id
    for update;

    if found then
      insert into private.eixpay_reward_reversals
        (user_id,source_id,event_code,amount,idempotency_key)
      values
        (v_user_id,v_referral.id,'approved_referral',v_claim.amount,
         'referral-return:' || v_referral.id::text)
      on conflict do nothing
      returning id into v_reversal_id;

      if v_reversal_id is not null then
        select balance,reward_debt into v_balance,v_debt
        from private.eixpay_wallets
        where user_id = v_user_id
        for update;

        v_deduct := least(v_balance,v_claim.amount);
        v_debt_added := v_claim.amount - v_deduct;

        update private.eixpay_wallets
        set balance = balance - v_deduct,
            reward_debt = reward_debt + v_debt_added,
            lifetime_spent = lifetime_spent + v_claim.amount,
            updated_at = now(),
            last_activity_at = now()
        where user_id = v_user_id
        returning balance into v_new_balance;

        insert into private.eixpay_ledger
          (wallet_user_id,entry_kind,event_code,amount,balance_after,source_id,idempotency_key,metadata)
        values
          (v_user_id,'reversal','approved_referral_reversal',v_claim.amount,v_new_balance,
           v_referral.id,'referral-return:' || v_referral.id::text,
           jsonb_build_object('reversal_id',v_reversal_id,'debt_added',v_debt_added,'order_id',p_order_id));
        v_reversed := v_reversed + 1;
      end if;
    end if;
  end loop;

  update private.eixpay_referrals
  set status = case when v_reversed > 0 or v_referral.status = 'rewarded' then 'reversed' else 'rejected' end
  where id = v_referral.id;

  insert into private.eixpay_audit_events(actor_id,event_code,subject_id,metadata)
  values (null,'referral_rewards_reversed',v_referral.id,
    jsonb_build_object('order_id',p_order_id,'reversed_wallets',v_reversed));

  return jsonb_build_object('success',true,'reversed_wallets',v_reversed);
end;
$function$;

-- Extend the existing order lifecycle trigger so a later return/refund also
-- reverses both referral rewards, using compensating ledger entries.
create or replace function private.eixpay_watch_order_reward_eligibility()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_config private.eixpay_config%rowtype;
  v_rule private.eixpay_reward_rules%rowtype;
begin
  if new.customer_id is null then
    return new;
  end if;

  if new.status = 'returned' or new.payment_status = 'refunded' then
    perform private.eixpay_reverse_order_reward(new.customer_id,new.id);
    perform private.eixpay_reverse_referral_for_order(new.id,new.customer_id);
    return new;
  end if;

  if new.status = 'delivered'
     and new.payment_status = 'paid'
     and new.delivery_fee_payment_status in ('paid','not_required') then
    select * into v_config from private.eixpay_config where singleton = true;
    select * into v_rule from private.eixpay_reward_rules where event_code = 'delivered_order';

    if found
       and v_config.wallet_enabled
       and v_config.earning_enabled
       and v_rule.enabled
       and v_rule.reward_amount > 0
       and not exists (
         select 1 from private.eixpay_order_reward_queue q where q.order_id = new.id
       ) then
      insert into private.eixpay_order_reward_queue
        (order_id,user_id,reward_amount_snapshot,eligible_at)
      values
        (new.id,new.customer_id,v_rule.reward_amount,
         now() + make_interval(hours => v_rule.settlement_delay_hours))
      on conflict (order_id) do nothing;
    end if;
  end if;

  return new;
end;
$function$;

revoke all on function public.eixpay_apply_referral_code(text) from public, anon;
grant execute on function public.eixpay_apply_referral_code(text) to authenticated;
revoke all on function public.eixpay_get_referral_summary() from public, anon;
grant execute on function public.eixpay_get_referral_summary() to authenticated;

do $cron$
begin
  if to_regclass('cron.job') is not null then
    begin
      perform cron.unschedule(jobid) from cron.job where jobname = 'eixpay-process-qualified-referrals';
    exception when others then null;
    end;
    perform cron.schedule(
      'eixpay-process-qualified-referrals',
      '*/15 * * * *',
      'select private.eixpay_process_qualified_referral_rewards();'
    );
  end if;
end;
$cron$;

