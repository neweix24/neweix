-- EixVerse campaigns, missions and Bangladesh-local daily check-in.
-- Eixon remains internal; all earning is gated by the existing EixPay switches/rules.

create table if not exists private.eixverse_campaigns (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  status text not null default 'draft' check (status in ('draft','scheduled','active','paused','closed')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  max_total_claims integer not null check (max_total_claims between 1 and 1000000),
  max_claims_per_user integer not null default 1 check (max_claims_per_user between 1 and 100),
  total_claims integer not null default 0 check (total_claims >= 0),
  created_by uuid not null references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (total_claims <= max_total_claims)
);
create index if not exists eixverse_campaigns_live_idx
  on private.eixverse_campaigns (starts_at, ends_at) where status in ('scheduled','active');

create table if not exists private.eixverse_missions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references private.eixverse_campaigns(id) on delete cascade,
  title text not null check (char_length(title) between 3 and 120),
  description text not null default '' check (char_length(description) <= 1000),
  mission_type text not null check (mission_type in ('daily_checkin','delivered_order','verified_review','qualified_referral')),
  reward_amount bigint not null check (reward_amount between 1 and 1000000),
  max_claims_per_user integer not null default 1 check (max_claims_per_user between 1 and 100),
  max_total_claims integer not null check (max_total_claims between 1 and 1000000),
  total_claims integer not null default 0 check (total_claims >= 0),
  is_enabled boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (total_claims <= max_total_claims)
);
create index if not exists eixverse_missions_campaign_idx on private.eixverse_missions(campaign_id, sort_order);

create table if not exists private.eixverse_mission_claims (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references private.eixverse_missions(id),
  campaign_id uuid not null references private.eixverse_campaigns(id),
  user_id uuid not null references auth.users(id) on delete cascade,
  evidence_id uuid,
  reward_amount bigint not null check (reward_amount > 0),
  created_at timestamptz not null default now(),
  constraint eixverse_mission_claim_once unique (mission_id, user_id, evidence_id)
);
create index if not exists eixverse_mission_claims_user_idx
  on private.eixverse_mission_claims(user_id, created_at desc);

create table if not exists private.eixverse_daily_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  local_date date not null,
  streak_days integer not null check (streak_days between 1 and 3650),
  reward_amount bigint not null check (reward_amount >= 0),
  created_at timestamptz not null default now(),
  constraint eixverse_daily_checkin_once unique (user_id, local_date)
);
create index if not exists eixverse_daily_checkins_user_date_idx
  on private.eixverse_daily_checkins(user_id, local_date desc);

alter table private.eixverse_campaigns enable row level security;
alter table private.eixverse_missions enable row level security;
alter table private.eixverse_mission_claims enable row level security;
alter table private.eixverse_daily_checkins enable row level security;
revoke all on private.eixverse_campaigns, private.eixverse_missions,
  private.eixverse_mission_claims, private.eixverse_daily_checkins
  from public, anon, authenticated, service_role;

create or replace function public.eixverse_daily_checkin()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user uuid := auth.uid();
  v_today date := (now() at time zone 'Asia/Dhaka')::date;
  v_streak integer;
  v_reward bigint;
  v_checkin private.eixverse_daily_checkins%rowtype;
  v_award jsonb;
begin
  if v_user is null then
    raise exception using errcode = '28000', message = 'AUTHENTICATION_REQUIRED';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text || ':eixverse-checkin', 0));
  select * into v_checkin from private.eixverse_daily_checkins
   where user_id = v_user and local_date = v_today;
  if found then
    return jsonb_build_object('success', true, 'duplicate', true,
      'local_date', v_today, 'streak_days', v_checkin.streak_days,
      'reward_amount', v_checkin.reward_amount);
  end if;

  select case when local_date = v_today - 1
       then least(streak_days + 1, 3650) else 1 end
    into v_streak
  from private.eixverse_daily_checkins
  where user_id = v_user
  order by local_date desc
  limit 1;
  v_streak := coalesce(v_streak, 1);

  select reward_amount into v_reward
  from private.eixpay_reward_rules
  where event_code = 'daily_checkin' and enabled = true;
  v_reward := greatest(coalesce(v_reward, 0), 0);

  insert into private.eixverse_daily_checkins(user_id, local_date, streak_days, reward_amount)
  values (v_user, v_today, v_streak, v_reward)
  returning * into v_checkin;

  if v_reward > 0 then
    v_award := private.eixpay_apply_reward(
      v_user, 'daily_checkin', v_checkin.id,
      'eixverse-checkin:' || v_user::text || ':' || v_today::text,
      v_reward, null
    );
    if not coalesce((v_award ->> 'success')::boolean, false) then
      update private.eixverse_daily_checkins set reward_amount = 0 where id = v_checkin.id;
      v_reward := 0;
    end if;
  end if;

  insert into private.eixpay_audit_events(actor_id,event_code,subject_id,metadata)
  values(v_user,'eixverse_daily_checkin',v_checkin.id,
    jsonb_build_object('local_date',v_today,'streak_days',v_streak,'reward_amount',v_reward));

  return jsonb_build_object('success',true,'duplicate',false,
    'local_date',v_today,'streak_days',v_streak,'reward_amount',v_reward);
end;
$function$;

create or replace function public.eixverse_get_missions()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_user uuid := auth.uid();
  v_today date := (now() at time zone 'Asia/Dhaka')::date;
begin
  if v_user is null then
    raise exception using errcode = '28000', message = 'AUTHENTICATION_REQUIRED';
  end if;
  return jsonb_build_object(
    'today_checkin', (select to_jsonb(c) from private.eixverse_daily_checkins c
      where c.user_id=v_user and c.local_date=v_today),
    'streak_days', coalesce((select streak_days from private.eixverse_daily_checkins
      where user_id=v_user order by local_date desc limit 1),0),
    'campaigns', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',c.id,'title',c.title,'description',c.description,
        'starts_at',c.starts_at,'ends_at',c.ends_at,
        'missions',(select coalesce(jsonb_agg(jsonb_build_object(
          'id',m.id,'title',m.title,'description',m.description,
          'mission_type',m.mission_type,'reward_amount',m.reward_amount,
          'claimed',(select count(*) from private.eixverse_mission_claims mc
            where mc.mission_id=m.id and mc.user_id=v_user),
          'max_claims_per_user',m.max_claims_per_user
        ) order by m.sort_order,m.created_at) ,'[]'::jsonb)
          from private.eixverse_missions m where m.campaign_id=c.id and m.is_enabled)
      ) order by c.starts_at), '[]'::jsonb)
      from private.eixverse_campaigns c
      where c.status='active' and c.starts_at <= now() and c.ends_at > now()
    ),'[]'::jsonb)
  );
end;
$function$;

create or replace function public.eixverse_claim_mission(p_mission_id uuid, p_evidence_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user uuid := auth.uid();
  v_m private.eixverse_missions%rowtype;
  v_c private.eixverse_campaigns%rowtype;
  v_claim private.eixverse_mission_claims%rowtype;
  v_award jsonb;
  v_count integer;
  v_evidence uuid;
begin
  if v_user is null then raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED'; end if;
  if p_mission_id is null then raise exception using errcode='22023',message='INVALID_MISSION'; end if;
  select * into v_m from private.eixverse_missions where id=p_mission_id and is_enabled;
  if not found then raise exception using errcode='P0002',message='MISSION_NOT_FOUND'; end if;
  select * into v_c from private.eixverse_campaigns where id=v_m.campaign_id for update;
  if not found or v_c.status <> 'active' or v_c.starts_at > now() or v_c.ends_at <= now()
     or v_c.total_claims >= v_c.max_total_claims or v_m.total_claims >= v_m.max_total_claims then
    raise exception using errcode='55000',message='MISSION_NOT_AVAILABLE';
  end if;

  -- The campaign row lock serializes claims in this campaign, so this
  -- campaign-wide per-user budget cannot be exceeded by concurrent requests.
  select count(*) into v_count
  from private.eixverse_mission_claims
  where campaign_id=v_c.id and user_id=v_user;
  if v_count >= v_c.max_claims_per_user then
    raise exception using errcode='55000',message='CAMPAIGN_USER_LIMIT_REACHED';
  end if;

  if v_m.mission_type='daily_checkin' then
    select id into v_evidence from private.eixverse_daily_checkins
    where user_id=v_user and local_date=(now() at time zone 'Asia/Dhaka')::date;
  elsif v_m.mission_type='delivered_order' then
    select o.id into v_evidence from public.orders o
    where o.customer_id=v_user and o.status='delivered' and o.payment_status='paid'
      and o.delivery_fee_payment_status in ('paid','not_required')
      and o.delivered_at <= now()-interval '7 days'
      and (p_evidence_id is null or o.id=p_evidence_id)
      and not exists(select 1 from private.eixverse_mission_claims mc
        where mc.mission_id=v_m.id and mc.user_id=v_user and mc.evidence_id=o.id)
    order by o.delivered_at limit 1;
  elsif v_m.mission_type='verified_review' then
    select r.id into v_evidence from private.eixpay_product_reviews r
    where r.user_id=v_user and r.status='approved'
      and (p_evidence_id is null or r.id=p_evidence_id)
      and not exists(select 1 from private.eixverse_mission_claims mc
        where mc.mission_id=v_m.id and mc.user_id=v_user and mc.evidence_id=r.id)
    order by r.created_at limit 1;
  elsif v_m.mission_type='qualified_referral' then
    select r.id into v_evidence from private.eixpay_referrals r
    where r.referrer_user_id=v_user and r.status in ('qualified','rewarded')
      and (p_evidence_id is null or r.id=p_evidence_id)
      and not exists(select 1 from private.eixverse_mission_claims mc
        where mc.mission_id=v_m.id and mc.user_id=v_user and mc.evidence_id=r.id)
    order by r.qualified_at limit 1;
  end if;
  if v_evidence is null then
    raise exception using errcode='55000',message='MISSION_REQUIREMENT_NOT_MET';
  end if;
  if v_m.mission_type='daily_checkin' and exists(
    select 1 from private.eixverse_mission_claims mc
    where mc.mission_id=v_m.id and mc.user_id=v_user
      and mc.created_at >= (date_trunc('day',now() at time zone 'Asia/Dhaka') at time zone 'Asia/Dhaka')
  ) then raise exception using errcode='55000',message='MISSION_DAILY_LIMIT_REACHED'; end if;

  select count(*) into v_count from private.eixverse_mission_claims
    where mission_id=v_m.id and user_id=v_user;
  if v_count >= v_m.max_claims_per_user then
    raise exception using errcode='55000',message='MISSION_USER_LIMIT_REACHED';
  end if;

  insert into private.eixverse_mission_claims(mission_id,campaign_id,user_id,evidence_id,reward_amount)
  values(v_m.id,v_c.id,v_user,v_evidence,v_m.reward_amount)
  on conflict do nothing returning * into v_claim;
  if v_claim.id is null then return jsonb_build_object('success',true,'duplicate',true); end if;

  v_award := private.eixpay_apply_reward(v_user,'campaign_action',v_claim.id,
    'eixverse-mission:'||v_claim.id::text,v_m.reward_amount,null);
  if not coalesce((v_award->>'success')::boolean,false) then
    raise exception using errcode='55000',message='MISSION_REWARD_NOT_AVAILABLE';
  end if;

  update private.eixverse_campaigns set total_claims=total_claims+1,updated_at=now() where id=v_c.id;
  update private.eixverse_missions set total_claims=total_claims+1,updated_at=now() where id=v_m.id;
  insert into private.eixpay_audit_events(actor_id,event_code,subject_id,metadata)
  values(v_user,'eixverse_mission_claimed',v_claim.id,
    jsonb_build_object('mission_id',v_m.id,'campaign_id',v_c.id,'evidence_id',v_evidence,'reward_amount',v_m.reward_amount));
  return jsonb_build_object('success',true,'claim_id',v_claim.id,'reward_amount',v_m.reward_amount,'award',v_award);
end;
$function$;

create or replace function public.eixverse_supreme_save_campaign(p_campaign jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_id uuid;
  v_title text := btrim(coalesce(p_campaign->>'title',''));
  v_start timestamptz := (p_campaign->>'starts_at')::timestamptz;
  v_end timestamptz := (p_campaign->>'ends_at')::timestamptz;
  v_max integer := (p_campaign->>'max_total_claims')::integer;
  v_user_max integer := coalesce((p_campaign->>'max_claims_per_user')::integer,1);
  v_status text := coalesce(p_campaign->>'status','draft');
begin
  if v_actor is null or not private.has_staff_role(array['supreme']::text[])
     or coalesce(auth.jwt()->>'aal','') <> 'aal2' then
    raise exception using errcode='42501',message='SUPREME_MFA_REQUIRED';
  end if;
  if jsonb_typeof(p_campaign)<>'object' or char_length(v_title) not between 3 and 120
     or v_start is null or v_end is null or v_end<=v_start
     or v_max not between 1 and 1000000 or v_user_max not between 1 and 100
     or v_status not in ('draft','scheduled','active','paused','closed') then
    raise exception using errcode='22023',message='INVALID_CAMPAIGN_CONFIG';
  end if;
  if v_status='active' and (v_start>now() or v_end<=now()) then
    raise exception using errcode='22023',message='ACTIVE_CAMPAIGN_MUST_BE_IN_WINDOW';
  end if;
  if nullif(p_campaign->>'id','') is not null then
    v_id := (p_campaign->>'id')::uuid;
    update private.eixverse_campaigns set title=v_title,
      description=left(coalesce(p_campaign->>'description',''),2000),
      starts_at=v_start,ends_at=v_end,max_total_claims=v_max,
      max_claims_per_user=v_user_max,status=v_status,updated_by=v_actor,updated_at=now()
      where id=v_id;
    if not found then raise exception using errcode='P0002',message='CAMPAIGN_NOT_FOUND'; end if;
  else
    insert into private.eixverse_campaigns(title,description,starts_at,ends_at,max_total_claims,max_claims_per_user,status,created_by,updated_by)
    values(v_title,left(coalesce(p_campaign->>'description',''),2000),v_start,v_end,v_max,v_user_max,v_status,v_actor,v_actor)
    returning id into v_id;
  end if;
  insert into private.eixpay_audit_events(actor_id,event_code,subject_id,metadata)
  values(v_actor,'eixverse_campaign_saved',v_id,jsonb_build_object('status',v_status,'max_total_claims',v_max));
  return jsonb_build_object('success',true,'campaign_id',v_id);
end;
$function$;

create or replace function public.eixverse_supreme_save_mission(p_mission jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_id uuid;
  v_campaign uuid := (p_mission->>'campaign_id')::uuid;
  v_type text := p_mission->>'mission_type';
  v_title text := btrim(coalesce(p_mission->>'title',''));
  v_reward bigint := (p_mission->>'reward_amount')::bigint;
  v_max integer := (p_mission->>'max_total_claims')::integer;
  v_user_max integer := coalesce((p_mission->>'max_claims_per_user')::integer,1);
begin
  if v_actor is null or not private.has_staff_role(array['supreme']::text[])
     or coalesce(auth.jwt()->>'aal','') <> 'aal2' then
    raise exception using errcode='42501',message='SUPREME_MFA_REQUIRED';
  end if;
  if v_campaign is null or v_type not in ('daily_checkin','delivered_order','verified_review','qualified_referral')
     or char_length(v_title) not between 3 and 120
     or v_reward not between 1 and 1000000 or v_max not between 1 and 1000000
     or v_user_max not between 1 and 100 then
    raise exception using errcode='22023',message='INVALID_MISSION_CONFIG';
  end if;
  if not exists(select 1 from private.eixverse_campaigns where id=v_campaign and status<>'closed') then
    raise exception using errcode='22023',message='CAMPAIGN_NOT_AVAILABLE';
  end if;
  if nullif(p_mission->>'id','') is not null then
    v_id := (p_mission->>'id')::uuid;
    update private.eixverse_missions set title=v_title,
      description=left(coalesce(p_mission->>'description',''),1000),
      mission_type=v_type,reward_amount=v_reward,max_total_claims=v_max,
      max_claims_per_user=v_user_max,is_enabled=coalesce((p_mission->>'is_enabled')::boolean,false),
      sort_order=coalesce((p_mission->>'sort_order')::integer,0),updated_at=now()
      where id=v_id and campaign_id=v_campaign;
    if not found then raise exception using errcode='P0002',message='MISSION_NOT_FOUND'; end if;
  else
    insert into private.eixverse_missions(campaign_id,title,description,mission_type,reward_amount,max_total_claims,max_claims_per_user,is_enabled,sort_order)
    values(v_campaign,v_title,left(coalesce(p_mission->>'description',''),1000),v_type,v_reward,v_max,v_user_max,
      coalesce((p_mission->>'is_enabled')::boolean,false),coalesce((p_mission->>'sort_order')::integer,0))
    returning id into v_id;
  end if;
  insert into private.eixpay_audit_events(actor_id,event_code,subject_id,metadata)
  values(v_actor,'eixverse_mission_saved',v_id,jsonb_build_object('campaign_id',v_campaign,'mission_type',v_type,'reward_amount',v_reward));
  return jsonb_build_object('success',true,'mission_id',v_id);
end;
$function$;

create or replace function public.eixverse_supreme_list_campaigns()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null or not private.has_staff_role(array['supreme']::text[])
     or coalesce(auth.jwt()->>'aal','') <> 'aal2' then
    raise exception using errcode='42501',message='SUPREME_MFA_REQUIRED';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',c.id,'title',c.title,'description',c.description,'status',c.status,
    'starts_at',c.starts_at,'ends_at',c.ends_at,'max_total_claims',c.max_total_claims,
    'max_claims_per_user',c.max_claims_per_user,'total_claims',c.total_claims,
    'missions',(select coalesce(jsonb_agg(to_jsonb(m) order by m.sort_order,m.created_at),'[]'::jsonb)
      from private.eixverse_missions m where m.campaign_id=c.id)
  ) order by c.created_at desc) from private.eixverse_campaigns c),'[]'::jsonb);
end;
$function$;

revoke all on function public.eixverse_daily_checkin() from public,anon;
revoke all on function public.eixverse_get_missions() from public,anon;
revoke all on function public.eixverse_claim_mission(uuid,uuid) from public,anon;
revoke all on function public.eixverse_supreme_save_campaign(jsonb) from public,anon;
revoke all on function public.eixverse_supreme_save_mission(jsonb) from public,anon;
revoke all on function public.eixverse_supreme_list_campaigns() from public,anon;
grant execute on function public.eixverse_daily_checkin() to authenticated;
grant execute on function public.eixverse_get_missions() to authenticated;
grant execute on function public.eixverse_claim_mission(uuid,uuid) to authenticated;
grant execute on function public.eixverse_supreme_save_campaign(jsonb) to authenticated;
grant execute on function public.eixverse_supreme_save_mission(jsonb) to authenticated;
grant execute on function public.eixverse_supreme_list_campaigns() to authenticated;

comment on table private.eixverse_daily_checkins is 'One Bangladesh-local daily check-in per customer; reward is gated by EixPay earning and daily_checkin rule.';
comment on table private.eixverse_campaigns is 'Supreme-controlled EixVerse campaigns with fixed global and per-user claim budgets.';
comment on table private.eixverse_missions is 'Missions backed by verified order, review, referral or daily-check-in evidence.';
