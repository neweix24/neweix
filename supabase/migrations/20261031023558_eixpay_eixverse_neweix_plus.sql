-- NEWEIX EixVerse foundation: Eixon, EixPay and Neweix+.
-- Internal loyalty/utility points only. No cash top-up, cash-out or external exchange.
-- Customer-to-customer transfers remain disabled until a separate legal review is confirmed.

create schema if not exists private;

create table if not exists private.eixpay_config (
  singleton boolean primary key default true check (singleton),
  wallet_enabled boolean not null default true,
  earning_enabled boolean not null default false,
  redemption_enabled boolean not null default false,
  transfer_enabled boolean not null default false,
  transfer_legal_review_confirmed boolean not null default false,
  transfer_requires_supreme_approval boolean not null default true,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

insert into private.eixpay_config (singleton)
values (true)
on conflict (singleton) do nothing;

create table if not exists private.eixpay_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  eix_id text not null unique
    default ('EIX-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  balance bigint not null default 0 check (balance >= 0),
  lifetime_earned bigint not null default 0 check (lifetime_earned >= 0),
  lifetime_spent bigint not null default 0 check (lifetime_spent >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_activity_at timestamptz
);

create table if not exists private.eixpay_ledger (
  id bigint generated always as identity primary key,
  wallet_user_id uuid not null,
  entry_kind text not null check (entry_kind in ('credit', 'debit', 'reversal')),
  event_code text not null,
  amount bigint not null check (amount > 0),
  balance_after bigint not null check (balance_after >= 0),
  source_id uuid,
  idempotency_key text not null,
  actor_id uuid,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  constraint eixpay_ledger_idempotency_unique unique (wallet_user_id, idempotency_key)
);

create index if not exists eixpay_ledger_user_created_idx
  on private.eixpay_ledger (wallet_user_id, created_at desc, id desc);
create index if not exists eixpay_ledger_event_created_idx
  on private.eixpay_ledger (wallet_user_id, event_code, created_at desc);

create table if not exists private.eixpay_reward_rules (
  event_code text primary key,
  display_name text not null,
  description text not null default '',
  enabled boolean not null default false,
  reward_amount bigint not null default 0 check (reward_amount >= 0),
  max_per_user_per_day integer not null default 0 check (max_per_user_per_day >= 0),
  requires_verified_phone boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into private.eixpay_reward_rules (event_code, display_name, description)
values
  ('delivered_order', 'Completed purchase', 'Reward after an eligible order is delivered and its return/refund window is cleared.'),
  ('approved_referral', 'Referral reward', 'Reward after the invited customer completes qualifying activity.'),
  ('verified_review', 'Verified review', 'Reward only after a genuine, order-linked review is approved.'),
  ('daily_checkin', 'Daily activity', 'Capped daily engagement reward with anti-abuse controls.'),
  ('campaign_action', 'Campaign participation', 'Reward for a verified campaign action.'),
  ('seller_achievement', 'Seller achievement', 'Reward for a verified seller milestone.'),
  ('membership_benefit', 'Membership benefit', 'Benefit associated with an active Neweix+ tier.')
on conflict (event_code) do nothing;

create table if not exists private.eixpay_transfer_requests (
  id uuid primary key default gen_random_uuid(),
  sender_user_id uuid not null,
  recipient_user_id uuid not null,
  amount bigint not null check (amount > 0),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cancelled', 'expired')),
  reason text not null default '' check (char_length(reason) <= 240),
  idempotency_key text not null,
  requested_at timestamptz not null default now(),
  decided_by uuid,
  decided_at timestamptz,
  decision_note text not null default '' check (char_length(decision_note) <= 500),
  constraint eixpay_transfer_not_self check (sender_user_id <> recipient_user_id),
  constraint eixpay_transfer_idempotency_unique unique (sender_user_id, idempotency_key)
);

create index if not exists eixpay_transfer_pending_idx
  on private.eixpay_transfer_requests (requested_at asc)
  where status = 'pending';

create table if not exists private.eixpay_redemptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reward_code text not null,
  reward_title_snapshot text not null,
  eixon_cost bigint not null check (eixon_cost > 0),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'fulfilled', 'cancelled')),
  requested_at timestamptz not null default now(),
  decided_by uuid,
  decided_at timestamptz,
  fulfilled_at timestamptz,
  decision_note text not null default '' check (char_length(decision_note) <= 500)
);

create index if not exists eixpay_redemptions_user_created_idx
  on private.eixpay_redemptions (user_id, requested_at desc);

create table if not exists private.neweix_plus_tiers (
  tier_code text primary key,
  display_name text not null,
  tier_rank integer not null unique check (tier_rank >= 0),
  is_enabled boolean not null default false,
  min_qualified_spend_bdt bigint check (min_qualified_spend_bdt is null or min_qualified_spend_bdt >= 0),
  min_qualified_orders integer check (min_qualified_orders is null or min_qualified_orders >= 0),
  qualification_period_days integer check (qualification_period_days is null or qualification_period_days > 0),
  benefits jsonb not null default '[]'::jsonb check (jsonb_typeof(benefits) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into private.neweix_plus_tiers
  (tier_code, display_name, tier_rank, is_enabled, benefits)
values
  ('free', 'Free', 0, true, '["Standard account access","Eligible Eixon rewards when the program is active"]'::jsonb),
  ('silver', 'Silver', 1, false, '[]'::jsonb),
  ('gold', 'Gold', 2, false, '[]'::jsonb),
  ('platinum', 'Platinum', 3, false, '[]'::jsonb),
  ('diamond', 'Diamond', 4, false, '[]'::jsonb),
  ('vip', 'VIP', 5, false, '[]'::jsonb)
on conflict (tier_code) do nothing;

create table if not exists private.neweix_plus_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tier_code text not null references private.neweix_plus_tiers(tier_code),
  status text not null default 'active'
    check (status in ('active', 'pending', 'expired', 'suspended', 'cancelled')),
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  assignment_source text not null default 'system'
    check (assignment_source in ('system', 'qualification', 'supreme', 'campaign')),
  assigned_by uuid,
  assignment_note text not null default '' check (char_length(assignment_note) <= 500),
  created_at timestamptz not null default now(),
  check (expires_at is null or expires_at > starts_at)
);

create unique index if not exists neweix_plus_one_active_membership_per_user
  on private.neweix_plus_memberships (user_id)
  where status = 'active';
create index if not exists neweix_plus_memberships_user_history_idx
  on private.neweix_plus_memberships (user_id, starts_at desc);

create table if not exists private.eixverse_modules (
  module_code text primary key,
  display_name text not null,
  description text not null default '',
  status text not null default 'planned'
    check (status in ('active', 'planned', 'disabled')),
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);

insert into private.eixverse_modules (module_code, display_name, description, status, sort_order)
values
  ('eixpay', 'EixPay', 'Eixon wallet, reward activity, redemptions and controlled transfer requests.', 'active', 10),
  ('neweix_plus', 'Neweix+', 'Customer membership, tier status and member benefits.', 'active', 20),
  ('eixon_rewards', 'Eixon Rewards', 'Earn Eixon from eligible and verified NEWEIX activities.', 'planned', 30),
  ('referrals', 'Referral Network', 'Invite friends and receive rewards after verified qualification.', 'planned', 40),
  ('campaigns', 'Campaigns & Missions', 'Limited-time missions, challenges and campaign rewards.', 'planned', 50),
  ('seller_perks', 'Seller Benefits', 'Verified seller achievements and seller-side benefits.', 'planned', 60),
  ('reward_catalog', 'Reward Catalog', 'Redeem eligible rewards and coupon benefits.', 'planned', 70)
on conflict (module_code) do nothing;

create table if not exists private.eixpay_audit_events (
  id bigint generated always as identity primary key,
  actor_id uuid,
  event_code text not null,
  subject_id uuid,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists eixpay_audit_created_idx
  on private.eixpay_audit_events (created_at desc, id desc);

-- Keep the financial-style activity history append-only.
create or replace function private.prevent_eixpay_ledger_mutation()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  raise exception using
    errcode = '55000',
    message = 'EIXON_LEDGER_IS_APPEND_ONLY';
end;
$function$;

drop trigger if exists eixpay_ledger_append_only on private.eixpay_ledger;
create trigger eixpay_ledger_append_only
before update or delete on private.eixpay_ledger
for each row execute function private.prevent_eixpay_ledger_mutation();

create or replace function private.prevent_eixpay_audit_mutation()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  raise exception using
    errcode = '55000',
    message = 'EIXPAY_AUDIT_IS_APPEND_ONLY';
end;
$function$;

drop trigger if exists eixpay_audit_append_only on private.eixpay_audit_events;
create trigger eixpay_audit_append_only
before update or delete on private.eixpay_audit_events
for each row execute function private.prevent_eixpay_audit_mutation();


revoke all on function private.prevent_eixpay_ledger_mutation() from public, anon, authenticated, service_role;
revoke all on function private.prevent_eixpay_audit_mutation() from public, anon, authenticated, service_role;

-- RLS is enabled as defense in depth. These tables are accessed only through the
-- narrow, permission-checked functions below; direct Data API access is not granted.
alter table private.eixpay_config enable row level security;
alter table private.eixpay_wallets enable row level security;
alter table private.eixpay_ledger enable row level security;
alter table private.eixpay_reward_rules enable row level security;
alter table private.eixpay_transfer_requests enable row level security;
alter table private.eixpay_redemptions enable row level security;
alter table private.neweix_plus_tiers enable row level security;
alter table private.neweix_plus_memberships enable row level security;
alter table private.eixverse_modules enable row level security;
alter table private.eixpay_audit_events enable row level security;

revoke all on all tables in schema private from anon, authenticated;
revoke all on all sequences in schema private from anon, authenticated;

drop policy if exists eixpay_config_no_direct_access on private.eixpay_config;
create policy eixpay_config_no_direct_access on private.eixpay_config
  for all to anon, authenticated using (false) with check (false);
drop policy if exists eixpay_wallets_no_direct_access on private.eixpay_wallets;
create policy eixpay_wallets_no_direct_access on private.eixpay_wallets
  for all to anon, authenticated using (false) with check (false);
drop policy if exists eixpay_ledger_no_direct_access on private.eixpay_ledger;
create policy eixpay_ledger_no_direct_access on private.eixpay_ledger
  for all to anon, authenticated using (false) with check (false);
drop policy if exists eixpay_reward_rules_no_direct_access on private.eixpay_reward_rules;
create policy eixpay_reward_rules_no_direct_access on private.eixpay_reward_rules
  for all to anon, authenticated using (false) with check (false);
drop policy if exists eixpay_transfer_requests_no_direct_access on private.eixpay_transfer_requests;
create policy eixpay_transfer_requests_no_direct_access on private.eixpay_transfer_requests
  for all to anon, authenticated using (false) with check (false);
drop policy if exists eixpay_redemptions_no_direct_access on private.eixpay_redemptions;
create policy eixpay_redemptions_no_direct_access on private.eixpay_redemptions
  for all to anon, authenticated using (false) with check (false);
drop policy if exists neweix_plus_tiers_no_direct_access on private.neweix_plus_tiers;
create policy neweix_plus_tiers_no_direct_access on private.neweix_plus_tiers
  for all to anon, authenticated using (false) with check (false);
drop policy if exists neweix_plus_memberships_no_direct_access on private.neweix_plus_memberships;
create policy neweix_plus_memberships_no_direct_access on private.neweix_plus_memberships
  for all to anon, authenticated using (false) with check (false);
drop policy if exists eixverse_modules_no_direct_access on private.eixverse_modules;
create policy eixverse_modules_no_direct_access on private.eixverse_modules
  for all to anon, authenticated using (false) with check (false);
drop policy if exists eixpay_audit_events_no_direct_access on private.eixpay_audit_events;
create policy eixpay_audit_events_no_direct_access on private.eixpay_audit_events
  for all to anon, authenticated using (false) with check (false);

create or replace function public.eixpay_get_wallet()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_wallet private.eixpay_wallets%rowtype;
  v_config private.eixpay_config%rowtype;
  v_membership jsonb;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'AUTHENTICATION_REQUIRED';
  end if;

  select * into v_config
  from private.eixpay_config
  where singleton = true;

  if not found or not v_config.wallet_enabled then
    return jsonb_build_object(
      'wallet_enabled', false,
      'currency_name', 'Eixon',
      'wallet_name', 'EixPay',
      'ecosystem_name', 'EixVerse'
    );
  end if;

  insert into private.eixpay_wallets (user_id)
  values (v_user_id)
  on conflict (user_id) do nothing;

  select * into v_wallet
  from private.eixpay_wallets
  where user_id = v_user_id;

  insert into private.neweix_plus_memberships (user_id, tier_code, status, assignment_source)
  select v_user_id, 'free', 'active', 'system'
  where not exists (
    select 1 from private.neweix_plus_memberships
    where user_id = v_user_id and status = 'active'
  );

  select jsonb_build_object(
    'tier_code', t.tier_code,
    'display_name', t.display_name,
    'tier_rank', t.tier_rank,
    'status', m.status,
    'starts_at', m.starts_at,
    'expires_at', m.expires_at,
    'benefits', t.benefits
  )
  into v_membership
  from private.neweix_plus_memberships m
  join private.neweix_plus_tiers t on t.tier_code = m.tier_code
  where m.user_id = v_user_id and m.status = 'active'
  order by m.starts_at desc
  limit 1;

  return jsonb_build_object(
    'wallet_enabled', true,
    'wallet_name', 'EixPay',
    'ecosystem_name', 'EixVerse',
    'currency_name', 'Eixon',
    'eix_id', v_wallet.eix_id,
    'balance', v_wallet.balance,
    'lifetime_earned', v_wallet.lifetime_earned,
    'lifetime_spent', v_wallet.lifetime_spent,
    'earning_enabled', v_config.earning_enabled,
    'redemption_enabled', v_config.redemption_enabled,
    'transfer_enabled', (v_config.transfer_enabled and v_config.transfer_legal_review_confirmed),
    'transfer_requires_supreme_approval', true,
    'membership', v_membership,
    'updated_at', v_wallet.updated_at,
    'last_activity_at', v_wallet.last_activity_at
  );
end;
$function$;

create or replace function public.eixpay_list_activity(
  p_limit integer default 20,
  p_before_id bigint default null
)
returns table (
  id bigint,
  entry_kind text,
  event_code text,
  amount bigint,
  balance_after bigint,
  source_id uuid,
  metadata jsonb,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'AUTHENTICATION_REQUIRED';
  end if;

  return query
  select l.id, l.entry_kind, l.event_code, l.amount, l.balance_after,
         l.source_id, l.metadata, l.created_at
  from private.eixpay_ledger l
  where l.wallet_user_id = v_user_id
    and (p_before_id is null or l.id < p_before_id)
  order by l.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
end;
$function$;

create or replace function public.eixpay_request_transfer(
  p_recipient_eix_id text,
  p_amount bigint,
  p_reason text default '',
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_recipient_id uuid;
  v_balance bigint;
  v_request private.eixpay_transfer_requests%rowtype;
  v_config private.eixpay_config%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'AUTHENTICATION_REQUIRED';
  end if;
  if p_amount is null or p_amount < 1 or p_amount > 1000000000 then
    raise exception using errcode = '22023', message = 'INVALID_EIXON_AMOUNT';
  end if;
  if p_recipient_eix_id is null or p_recipient_eix_id !~ '^EIX-[A-F0-9]{8}$' then
    raise exception using errcode = '22023', message = 'INVALID_RECIPIENT_EIX_ID';
  end if;
  if coalesce(char_length(p_reason), 0) > 240 then
    raise exception using errcode = '22023', message = 'TRANSFER_REASON_TOO_LONG';
  end if;
  if p_idempotency_key is null or char_length(p_idempotency_key) < 8 or char_length(p_idempotency_key) > 100 then
    raise exception using errcode = '22023', message = 'INVALID_IDEMPOTENCY_KEY';
  end if;

  select * into v_config from private.eixpay_config where singleton = true;
  if not found or not v_config.wallet_enabled
     or not v_config.transfer_enabled
     or not v_config.transfer_legal_review_confirmed then
    raise exception using errcode = '55000', message = 'EIXON_TRANSFERS_NOT_AVAILABLE';
  end if;

  select user_id into v_recipient_id
  from private.eixpay_wallets
  where eix_id = upper(p_recipient_eix_id);

  if v_recipient_id is null then
    raise exception using errcode = '22023', message = 'RECIPIENT_NOT_FOUND';
  end if;
  if v_recipient_id = v_user_id then
    raise exception using errcode = '22023', message = 'CANNOT_TRANSFER_TO_SELF';
  end if;

  select balance into v_balance
  from private.eixpay_wallets
  where user_id = v_user_id
  for update;

  if v_balance is null then
    raise exception using errcode = '55000', message = 'EIXPAY_WALLET_NOT_INITIALIZED';
  end if;
  if v_balance < p_amount then
    raise exception using errcode = '22023', message = 'INSUFFICIENT_EIXON_BALANCE';
  end if;

  insert into private.eixpay_transfer_requests
    (sender_user_id, recipient_user_id, amount, reason, idempotency_key)
  values
    (v_user_id, v_recipient_id, p_amount, coalesce(trim(p_reason), ''), p_idempotency_key)
  on conflict (sender_user_id, idempotency_key) do nothing
  returning * into v_request;

  if v_request.id is null then
    select * into v_request
    from private.eixpay_transfer_requests
    where sender_user_id = v_user_id and idempotency_key = p_idempotency_key;
  end if;

  return jsonb_build_object(
    'success', true,
    'request_id', v_request.id,
    'status', v_request.status,
    'approval_required', true,
    'message', 'Transfer request submitted. Eixon will move only after Supreme approval.'
  );
end;
$function$;

create or replace function public.eixpay_list_pending_transfers()
returns table (
  request_id uuid,
  sender_eix_id text,
  recipient_eix_id text,
  sender_name text,
  recipient_name text,
  amount bigint,
  reason text,
  requested_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null
     or not private.has_staff_role(array['supreme']::text[])
     or coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
    raise exception using errcode = '42501', message = 'SUPREME_MFA_REQUIRED';
  end if;

  return query
  select r.id, sw.eix_id, rw.eix_id,
         coalesce(sp.full_name, sp.display_name, 'NEWEIX customer'),
         coalesce(rp.full_name, rp.display_name, 'NEWEIX customer'),
         r.amount, r.reason, r.requested_at
  from private.eixpay_transfer_requests r
  join private.eixpay_wallets sw on sw.user_id = r.sender_user_id
  join private.eixpay_wallets rw on rw.user_id = r.recipient_user_id
  left join public.customer_profiles sp on sp.user_id = r.sender_user_id
  left join public.customer_profiles rp on rp.user_id = r.recipient_user_id
  where r.status = 'pending'
  order by r.requested_at asc
  limit 100;
end;
$function$;

create or replace function public.eixpay_decide_transfer(
  p_request_id uuid,
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
  v_request private.eixpay_transfer_requests%rowtype;
  v_config private.eixpay_config%rowtype;
  v_sender_balance bigint;
  v_recipient_balance bigint;
begin
  if v_actor is null
     or not private.has_staff_role(array['supreme']::text[])
     or coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
    raise exception using errcode = '42501', message = 'SUPREME_MFA_REQUIRED';
  end if;
  if p_request_id is null or p_decision not in ('approve', 'reject') then
    raise exception using errcode = '22023', message = 'INVALID_TRANSFER_DECISION';
  end if;
  if coalesce(char_length(p_note), 0) > 500 then
    raise exception using errcode = '22023', message = 'DECISION_NOTE_TOO_LONG';
  end if;

  select * into v_request
  from private.eixpay_transfer_requests
  where id = p_request_id
  for update;

  if not found or v_request.status <> 'pending' then
    raise exception using errcode = '55000', message = 'TRANSFER_REQUEST_NOT_PENDING';
  end if;

  if p_decision = 'reject' then
    update private.eixpay_transfer_requests
    set status = 'rejected',
        decided_by = v_actor,
        decided_at = now(),
        decision_note = coalesce(trim(p_note), '')
    where id = p_request_id;

    insert into private.eixpay_audit_events (actor_id, event_code, subject_id, metadata)
    values (v_actor, 'transfer_rejected', p_request_id,
      jsonb_build_object('amount', v_request.amount, 'note', coalesce(trim(p_note), '')));

    return jsonb_build_object('success', true, 'status', 'rejected');
  end if;

  select * into v_config from private.eixpay_config where singleton = true;
  if not found or not v_config.transfer_enabled or not v_config.transfer_legal_review_confirmed then
    raise exception using errcode = '55000', message = 'EIXON_TRANSFERS_NOT_AVAILABLE';
  end if;

  insert into private.eixpay_wallets (user_id)
  values (v_request.recipient_user_id)
  on conflict (user_id) do nothing;

  -- Lock both wallets in stable UUID order to avoid transfer deadlocks.
  perform w.user_id
  from private.eixpay_wallets w
  where w.user_id in (v_request.sender_user_id, v_request.recipient_user_id)
  order by w.user_id
  for update;

  select balance into v_sender_balance
  from private.eixpay_wallets
  where user_id = v_request.sender_user_id;

  if v_sender_balance is null or v_sender_balance < v_request.amount then
    raise exception using errcode = '22023', message = 'INSUFFICIENT_EIXON_BALANCE_AT_APPROVAL';
  end if;

  update private.eixpay_wallets
  set balance = balance - v_request.amount,
      lifetime_spent = lifetime_spent + v_request.amount,
      updated_at = now(),
      last_activity_at = now()
  where user_id = v_request.sender_user_id
  returning balance into v_sender_balance;

  update private.eixpay_wallets
  set balance = balance + v_request.amount,
      lifetime_earned = lifetime_earned + v_request.amount,
      updated_at = now(),
      last_activity_at = now()
  where user_id = v_request.recipient_user_id
  returning balance into v_recipient_balance;

  insert into private.eixpay_ledger
    (wallet_user_id, entry_kind, event_code, amount, balance_after, source_id, idempotency_key, actor_id, metadata)
  values
    (v_request.sender_user_id, 'debit', 'transfer_out', v_request.amount, v_sender_balance,
     p_request_id, 'transfer:' || p_request_id::text || ':out', v_actor,
     jsonb_build_object('recipient_user_id', v_request.recipient_user_id)),
    (v_request.recipient_user_id, 'credit', 'transfer_in', v_request.amount, v_recipient_balance,
     p_request_id, 'transfer:' || p_request_id::text || ':in', v_actor,
     jsonb_build_object('sender_user_id', v_request.sender_user_id));

  update private.eixpay_transfer_requests
  set status = 'approved',
      decided_by = v_actor,
      decided_at = now(),
      decision_note = coalesce(trim(p_note), '')
  where id = p_request_id;

  insert into private.eixpay_audit_events (actor_id, event_code, subject_id, metadata)
  values (v_actor, 'transfer_approved', p_request_id,
    jsonb_build_object('amount', v_request.amount,
                       'sender_user_id', v_request.sender_user_id,
                       'recipient_user_id', v_request.recipient_user_id));

  return jsonb_build_object(
    'success', true,
    'status', 'approved',
    'sender_balance_after', v_sender_balance,
    'recipient_balance_after', v_recipient_balance
  );
end;
$function$;

create or replace function public.eixpay_award_reward(
  p_user_id uuid,
  p_event_code text,
  p_source_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_config private.eixpay_config%rowtype;
  v_rule private.eixpay_reward_rules%rowtype;
  v_balance bigint;
  v_new_balance bigint;
  v_today_count integer;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_user_id is null or p_event_code is null
     or p_idempotency_key is null
     or char_length(p_idempotency_key) < 8
     or char_length(p_idempotency_key) > 150 then
    raise exception using errcode = '22023', message = 'INVALID_REWARD_REQUEST';
  end if;

  select * into v_config from private.eixpay_config where singleton = true;
  if not found or not v_config.wallet_enabled or not v_config.earning_enabled then
    return jsonb_build_object('success', false, 'reason', 'earning_disabled');
  end if;

  select * into v_rule
  from private.eixpay_reward_rules
  where event_code = p_event_code;

  if not found or not v_rule.enabled or v_rule.reward_amount <= 0 then
    return jsonb_build_object('success', false, 'reason', 'reward_rule_disabled');
  end if;

  insert into private.eixpay_wallets (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  perform 1 from private.eixpay_wallets
  where user_id = p_user_id
  for update;

  if exists (
    select 1 from private.eixpay_ledger
    where wallet_user_id = p_user_id and idempotency_key = p_idempotency_key
  ) then
    return jsonb_build_object('success', true, 'duplicate', true);
  end if;

  if v_rule.requires_verified_phone and not exists (
    select 1 from public.customer_profiles
    where user_id = p_user_id and phone_verified_at is not null
  ) then
    return jsonb_build_object('success', false, 'reason', 'verified_phone_required');
  end if;

  if v_rule.max_per_user_per_day > 0 then
    select count(*) into v_today_count
    from private.eixpay_ledger
    where wallet_user_id = p_user_id
      and event_code = p_event_code
      and entry_kind = 'credit'
      and created_at >= date_trunc('day', now());
    if v_today_count >= v_rule.max_per_user_per_day then
      return jsonb_build_object('success', false, 'reason', 'daily_limit_reached');
    end if;
  end if;

  select balance into v_balance
  from private.eixpay_wallets
  where user_id = p_user_id;

  update private.eixpay_wallets
  set balance = balance + v_rule.reward_amount,
      lifetime_earned = lifetime_earned + v_rule.reward_amount,
      updated_at = now(),
      last_activity_at = now()
  where user_id = p_user_id
  returning balance into v_new_balance;

  insert into private.eixpay_ledger
    (wallet_user_id, entry_kind, event_code, amount, balance_after, source_id, idempotency_key, metadata)
  values
    (p_user_id, 'credit', p_event_code, v_rule.reward_amount, v_new_balance,
     p_source_id, p_idempotency_key, jsonb_build_object('rule', p_event_code));

  return jsonb_build_object(
    'success', true,
    'awarded', v_rule.reward_amount,
    'balance_after', v_new_balance
  );
end;
$function$;

create or replace function public.eixpay_set_program_config(
  p_wallet_enabled boolean,
  p_earning_enabled boolean,
  p_redemption_enabled boolean,
  p_transfer_enabled boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_transfer_enabled boolean;
begin
  if v_actor is null
     or not private.has_staff_role(array['supreme']::text[])
     or coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
    raise exception using errcode = '42501', message = 'SUPREME_MFA_REQUIRED';
  end if;
  if p_wallet_enabled is null or p_earning_enabled is null
     or p_redemption_enabled is null or p_transfer_enabled is null then
    raise exception using errcode = '22023', message = 'INVALID_PROGRAM_CONFIG';
  end if;
  if not p_wallet_enabled and (p_earning_enabled or p_redemption_enabled or p_transfer_enabled) then
    raise exception using errcode = '22023', message = 'WALLET_MUST_BE_ENABLED';
  end if;

  select (p_transfer_enabled and transfer_legal_review_confirmed)
  into v_transfer_enabled
  from private.eixpay_config
  where singleton = true;

  update private.eixpay_config
  set wallet_enabled = p_wallet_enabled,
      earning_enabled = p_earning_enabled,
      redemption_enabled = p_redemption_enabled,
      transfer_enabled = coalesce(v_transfer_enabled, false),
      transfer_requires_supreme_approval = true,
      updated_by = v_actor,
      updated_at = now()
  where singleton = true;

  insert into private.eixpay_audit_events (actor_id, event_code, metadata)
  values (v_actor, 'program_config_updated',
    jsonb_build_object(
      'wallet_enabled', p_wallet_enabled,
      'earning_enabled', p_earning_enabled,
      'redemption_enabled', p_redemption_enabled,
      'transfer_enabled', coalesce(v_transfer_enabled, false)
    ));

  return jsonb_build_object(
    'success', true,
    'wallet_enabled', p_wallet_enabled,
    'earning_enabled', p_earning_enabled,
    'redemption_enabled', p_redemption_enabled,
    'transfer_enabled', coalesce(v_transfer_enabled, false),
    'transfer_requires_supreme_approval', true
  );
end;
$function$;

create or replace function public.eixpay_set_reward_rule(
  p_event_code text,
  p_enabled boolean,
  p_reward_amount bigint,
  p_max_per_user_per_day integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null
     or not private.has_staff_role(array['supreme']::text[])
     or coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
    raise exception using errcode = '42501', message = 'SUPREME_MFA_REQUIRED';
  end if;
  if p_event_code is null or p_enabled is null
     or p_reward_amount is null or p_reward_amount < 0
     or p_max_per_user_per_day is null or p_max_per_user_per_day < 0 then
    raise exception using errcode = '22023', message = 'INVALID_REWARD_RULE';
  end if;

  update private.eixpay_reward_rules
  set enabled = p_enabled,
      reward_amount = p_reward_amount,
      max_per_user_per_day = p_max_per_user_per_day,
      updated_at = now()
  where event_code = p_event_code;

  if not found then
    raise exception using errcode = '22023', message = 'UNKNOWN_REWARD_EVENT';
  end if;

  insert into private.eixpay_audit_events (actor_id, event_code, metadata)
  values (v_actor, 'reward_rule_updated',
    jsonb_build_object(
      'event_code', p_event_code,
      'enabled', p_enabled,
      'reward_amount', p_reward_amount,
      'max_per_user_per_day', p_max_per_user_per_day
    ));

  return jsonb_build_object('success', true);
end;
$function$;

create or replace function public.neweix_plus_get_status()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_membership jsonb;
  v_tiers jsonb;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'AUTHENTICATION_REQUIRED';
  end if;

  insert into private.neweix_plus_memberships (user_id, tier_code, status, assignment_source)
  select v_user_id, 'free', 'active', 'system'
  where not exists (
    select 1 from private.neweix_plus_memberships
    where user_id = v_user_id and status = 'active'
  );

  select jsonb_build_object(
    'tier_code', t.tier_code,
    'display_name', t.display_name,
    'tier_rank', t.tier_rank,
    'status', m.status,
    'starts_at', m.starts_at,
    'expires_at', m.expires_at,
    'benefits', t.benefits
  )
  into v_membership
  from private.neweix_plus_memberships m
  join private.neweix_plus_tiers t on t.tier_code = m.tier_code
  where m.user_id = v_user_id and m.status = 'active'
  order by m.starts_at desc
  limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
    'tier_code', tier_code,
    'display_name', display_name,
    'tier_rank', tier_rank,
    'is_enabled', is_enabled,
    'min_qualified_spend_bdt', min_qualified_spend_bdt,
    'min_qualified_orders', min_qualified_orders,
    'qualification_period_days', qualification_period_days,
    'benefits', benefits
  ) order by tier_rank), '[]'::jsonb)
  into v_tiers
  from private.neweix_plus_tiers;

  return jsonb_build_object(
    'membership', v_membership,
    'tiers', v_tiers,
    'membership_name', 'Neweix+'
  );
end;
$function$;

create or replace function public.eixverse_get_modules()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_modules jsonb;
begin
  if auth.uid() is null then
    raise exception using errcode = '28000', message = 'AUTHENTICATION_REQUIRED';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'module_code', module_code,
    'display_name', display_name,
    'description', description,
    'status', status,
    'sort_order', sort_order
  ) order by sort_order), '[]'::jsonb)
  into v_modules
  from private.eixverse_modules;

  return jsonb_build_object('ecosystem_name', 'EixVerse', 'modules', v_modules);
end;
$function$;

-- Functions are explicit APIs. No PUBLIC/anon execution; only signed-in users
-- or the trusted service role can run the matching operation.
revoke all on function public.eixpay_get_wallet() from public, anon;
revoke all on function public.eixpay_list_activity(integer, bigint) from public, anon;
revoke all on function public.eixpay_request_transfer(text, bigint, text, text) from public, anon;
revoke all on function public.eixpay_list_pending_transfers() from public, anon;
revoke all on function public.eixpay_decide_transfer(uuid, text, text) from public, anon;
revoke all on function public.eixpay_award_reward(uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function public.eixpay_set_program_config(boolean, boolean, boolean, boolean) from public, anon;
revoke all on function public.eixpay_set_reward_rule(text, boolean, bigint, integer) from public, anon;
revoke all on function public.neweix_plus_get_status() from public, anon;
revoke all on function public.eixverse_get_modules() from public, anon;

grant execute on function public.eixpay_get_wallet() to authenticated;
grant execute on function public.eixpay_list_activity(integer, bigint) to authenticated;
grant execute on function public.eixpay_request_transfer(text, bigint, text, text) to authenticated;
grant execute on function public.eixpay_list_pending_transfers() to authenticated;
grant execute on function public.eixpay_decide_transfer(uuid, text, text) to authenticated;
grant execute on function public.eixpay_award_reward(uuid, text, uuid, text) to service_role;
grant execute on function public.eixpay_set_program_config(boolean, boolean, boolean, boolean) to authenticated;
grant execute on function public.eixpay_set_reward_rule(text, boolean, bigint, integer) to authenticated;
grant execute on function public.neweix_plus_get_status() to authenticated;
grant execute on function public.eixverse_get_modules() to authenticated;

comment on schema private is
  'Internal NEWEIX application data. EixPay, Eixon and Neweix+ tables are not exposed directly through the Supabase Data API.';
comment on table private.eixpay_ledger is
  'Append-only Eixon activity ledger. Corrections must be compensating entries; never update or delete.';
comment on table private.eixpay_transfer_requests is
  'Customer Eixon transfer requests. Sender and recipient balances change only in the Supreme-approved atomic decision function.';
comment on table private.neweix_plus_memberships is
  'Neweix+ customer membership history. Only one active tier may exist per customer.';
