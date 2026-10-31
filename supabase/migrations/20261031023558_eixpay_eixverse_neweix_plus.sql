-- NEWEIX EixVerse foundation: Eixon, EixPay and Neweix+.
-- Internal loyalty/utility points only. No cash top-up, cash-out or external exchange.
-- Customer-to-customer transfers remain disabled until a separate legal review is confirmed.

create schema if not exists private;

create table if not exists private.eixpay_config (
  singleton boolean primary key default true check (singleton),
  wallet_enabled boolean not null default true,
  earning_enabled boolean not null default false,
  redemption_enabled boolean not null default false,
  redemption_legal_review_confirmed boolean not null default false,
  transfer_enabled boolean not null default false,
  transfer_legal_review_confirmed boolean not null default false,
  transfer_requires_supreme_approval boolean not null default true,
  min_transfer_amount bigint not null default 1 check (min_transfer_amount >= 1),
  max_transfer_amount bigint not null default 5000 check (max_transfer_amount >= min_transfer_amount),
  max_transfer_daily_amount bigint not null default 10000 check (max_transfer_daily_amount >= max_transfer_amount),
  max_transfer_requests_per_day integer not null default 5 check (max_transfer_requests_per_day between 1 and 50),
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
  reward_debt bigint not null default 0 check (reward_debt >= 0),
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
  settlement_delay_hours integer not null default 0 check (settlement_delay_hours between 0 and 2160),
  requires_verified_phone boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into private.eixpay_reward_rules (event_code, display_name, description, settlement_delay_hours)
values
  ('delivered_order', 'Completed purchase', 'Reward after an eligible order is delivered, paid and its return window clears.', 168),
  ('approved_referral', 'Referral reward', 'Reward after the invited customer completes qualifying activity.', 0),
  ('verified_review', 'Verified review', 'Reward only after a genuine, order-linked review is approved.', 0),
  ('daily_checkin', 'Daily activity', 'Capped daily engagement reward with anti-abuse controls.', 0),
  ('campaign_action', 'Campaign participation', 'Reward for a verified campaign action.', 0),
  ('seller_achievement', 'Seller achievement', 'Reward for a verified seller milestone.', 0),
  ('membership_benefit', 'Membership benefit', 'Benefit associated with an active Neweix+ tier.', 0)
on conflict (event_code) do nothing;

create table if not exists private.eixpay_reward_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_code text not null,
  source_id uuid,
  idempotency_key text not null,
  amount bigint not null check (amount > 0),
  created_at timestamptz not null default now(),
  constraint eixpay_reward_claim_user_key unique (user_id, idempotency_key),
  constraint eixpay_reward_claim_source unique (user_id, event_code, source_id)
);

create index if not exists eixpay_reward_claim_user_event_created_idx
  on private.eixpay_reward_claims (user_id, event_code, created_at desc);

create table if not exists private.eixpay_reward_reversals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_id uuid not null,
  event_code text not null,
  amount bigint not null check (amount > 0),
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  constraint eixpay_reward_reversal_source_unique unique (user_id, source_id, event_code),
  constraint eixpay_reward_reversal_key_unique unique (user_id, idempotency_key)
);

create table if not exists private.eixpay_order_reward_queue (
  order_id uuid primary key references public.orders(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'blocked', 'awarded', 'cancelled', 'reversed')),
  reward_amount_snapshot bigint not null check (reward_amount_snapshot > 0),
  eligible_at timestamptz not null,
  queued_at timestamptz not null default now(),
  awarded_at timestamptz,
  cancelled_at timestamptz,
  reversed_at timestamptz,
  last_attempt_at timestamptz,
  last_result text
);

create index if not exists eixpay_order_reward_due_idx
  on private.eixpay_order_reward_queue (eligible_at asc)
  where status in ('pending', 'blocked');

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

drop trigger if exists eixpay_reward_claims_append_only on private.eixpay_reward_claims;
create trigger eixpay_reward_claims_append_only
before update or delete on private.eixpay_reward_claims
for each row execute function private.prevent_eixpay_audit_mutation();

drop trigger if exists eixpay_reward_reversals_append_only on private.eixpay_reward_reversals;
create trigger eixpay_reward_reversals_append_only
before update or delete on private.eixpay_reward_reversals
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
alter table private.eixpay_reward_claims enable row level security;
alter table private.eixpay_reward_reversals enable row level security;
alter table private.eixpay_order_reward_queue enable row level security;

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
drop policy if exists eixpay_reward_claims_no_direct_access on private.eixpay_reward_claims;
create policy eixpay_reward_claims_no_direct_access on private.eixpay_reward_claims
  for all to anon, authenticated using (false) with check (false);
drop policy if exists eixpay_reward_reversals_no_direct_access on private.eixpay_reward_reversals;
create policy eixpay_reward_reversals_no_direct_access on private.eixpay_reward_reversals
  for all to anon, authenticated using (false) with check (false);
drop policy if exists eixpay_order_reward_queue_no_direct_access on private.eixpay_order_reward_queue;
create policy eixpay_order_reward_queue_no_direct_access on private.eixpay_order_reward_queue
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

  -- Serialize first-time wallet and default membership initialization per customer.
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  insert into private.eixpay_wallets (user_id)
  values (v_user_id)
  on conflict (user_id) do nothing;

  select * into v_wallet
  from private.eixpay_wallets
  where user_id = v_user_id
  for update;

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
    'reward_debt', v_wallet.reward_debt,
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
  v_request_count integer;
  v_daily_amount bigint;
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

  select * into v_request
  from private.eixpay_transfer_requests
  where sender_user_id = v_user_id and idempotency_key = p_idempotency_key;

  if found then
    if v_request.recipient_user_id <> v_recipient_id or v_request.amount <> p_amount then
      raise exception using errcode = '22023', message = 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_TRANSFER';
    end if;
    return jsonb_build_object(
      'success', true,
      'request_id', v_request.id,
      'status', v_request.status,
      'approval_required', true,
      'duplicate', true
    );
  end if;

  if p_amount < v_config.min_transfer_amount or p_amount > v_config.max_transfer_amount then
    raise exception using errcode = '22023', message = 'TRANSFER_AMOUNT_OUTSIDE_CONFIGURED_LIMITS';
  end if;

  select count(*)::integer,
         coalesce(sum(amount) filter (where status in ('pending','approved')), 0)::bigint
  into v_request_count, v_daily_amount
  from private.eixpay_transfer_requests
  where sender_user_id = v_user_id
    and requested_at >= date_trunc('day', now());

  if v_request_count >= v_config.max_transfer_requests_per_day then
    raise exception using errcode = '22023', message = 'DAILY_TRANSFER_REQUEST_LIMIT_REACHED';
  end if;
  if v_daily_amount + p_amount > v_config.max_transfer_daily_amount then
    raise exception using errcode = '22023', message = 'DAILY_TRANSFER_AMOUNT_LIMIT_REACHED';
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
    if v_request.recipient_user_id <> v_recipient_id or v_request.amount <> p_amount then
      raise exception using errcode = '22023', message = 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_TRANSFER';
    end if;
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

create or replace function public.eixpay_list_my_transfers(
  p_limit integer default 20
)
returns table (
  request_id uuid,
  direction text,
  counterparty_eix_id text,
  amount bigint,
  status text,
  reason text,
  requested_at timestamptz,
  decided_at timestamptz,
  decision_note text
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
  select
    r.id,
    case when r.sender_user_id = v_user_id then 'sent' else 'received' end,
    case when r.sender_user_id = v_user_id then rw.eix_id else sw.eix_id end,
    r.amount,
    r.status,
    r.reason,
    r.requested_at,
    r.decided_at,
    r.decision_note
  from private.eixpay_transfer_requests r
  join private.eixpay_wallets sw on sw.user_id = r.sender_user_id
  join private.eixpay_wallets rw on rw.user_id = r.recipient_user_id
  where r.sender_user_id = v_user_id or r.recipient_user_id = v_user_id
  order by r.requested_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
end;
$function$;

create or replace function public.eixpay_cancel_transfer(
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_request private.eixpay_transfer_requests%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'AUTHENTICATION_REQUIRED';
  end if;
  if p_request_id is null then
    raise exception using errcode = '22023', message = 'INVALID_TRANSFER_REQUEST_ID';
  end if;

  select * into v_request
  from private.eixpay_transfer_requests
  where id = p_request_id and sender_user_id = v_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'TRANSFER_REQUEST_NOT_FOUND';
  end if;
  if v_request.status <> 'pending' then
    raise exception using errcode = '55000', message = 'TRANSFER_REQUEST_NOT_PENDING';
  end if;

  update private.eixpay_transfer_requests
  set status = 'cancelled',
      decided_at = now(),
      decision_note = 'Cancelled by sender before Supreme approval.'
  where id = p_request_id;

  insert into private.eixpay_audit_events (actor_id, event_code, subject_id, metadata)
  values (v_user_id, 'transfer_cancelled_by_sender', p_request_id,
    jsonb_build_object('amount', v_request.amount, 'recipient_user_id', v_request.recipient_user_id));

  return jsonb_build_object('success', true, 'status', 'cancelled', 'balance_changed', false);
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
  if p_request_id is null or p_decision is null or p_decision not in ('approve', 'reject') then
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
  if v_request.amount < v_config.min_transfer_amount or v_request.amount > v_config.max_transfer_amount then
    raise exception using errcode = '22023', message = 'TRANSFER_AMOUNT_OUTSIDE_CONFIGURED_LIMITS';
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

  if (
    select coalesce(sum(amount), 0)
    from private.eixpay_transfer_requests
    where sender_user_id = v_request.sender_user_id
      and status = 'approved'
      and requested_at >= date_trunc('day', now())
  ) + v_request.amount > v_config.max_transfer_daily_amount then
    raise exception using errcode = '22023', message = 'DAILY_TRANSFER_AMOUNT_LIMIT_REACHED';
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

create or replace function private.eixpay_apply_reward(
  p_user_id uuid,
  p_event_code text,
  p_source_id uuid,
  p_idempotency_key text,
  p_amount_override bigint default null,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_config private.eixpay_config%rowtype;
  v_rule private.eixpay_reward_rules%rowtype;
  v_amount bigint;
  v_balance bigint;
  v_new_balance bigint;
  v_debt bigint;
  v_debt_recovered bigint;
  v_credit bigint;
  v_today_count integer;
  v_claim_id uuid;
begin
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

  if not found or not v_rule.enabled then
    return jsonb_build_object('success', false, 'reason', 'reward_rule_disabled');
  end if;

  v_amount := coalesce(p_amount_override, v_rule.reward_amount);
  if v_amount is null or v_amount <= 0 then
    return jsonb_build_object('success', false, 'reason', 'reward_amount_unavailable');
  end if;

  insert into private.eixpay_wallets (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  perform 1 from private.eixpay_wallets
  where user_id = p_user_id
  for update;

  if v_rule.requires_verified_phone and not exists (
    select 1 from public.customer_profiles
    where user_id = p_user_id and phone_verified_at is not null
  ) then
    return jsonb_build_object('success', false, 'reason', 'verified_phone_required');
  end if;

  if v_rule.max_per_user_per_day > 0 then
    select count(*) into v_today_count
    from private.eixpay_reward_claims
    where user_id = p_user_id
      and event_code = p_event_code
      and created_at >= date_trunc('day', now());
    if v_today_count >= v_rule.max_per_user_per_day then
      return jsonb_build_object('success', false, 'reason', 'daily_limit_reached');
    end if;
  end if;

  insert into private.eixpay_reward_claims
    (user_id, event_code, source_id, idempotency_key, amount)
  values (p_user_id, p_event_code, p_source_id, p_idempotency_key, v_amount)
  on conflict do nothing
  returning id into v_claim_id;

  if v_claim_id is null then
    return jsonb_build_object('success', true, 'duplicate', true);
  end if;

  select balance, reward_debt
  into v_balance, v_debt
  from private.eixpay_wallets
  where user_id = p_user_id;

  v_debt_recovered := least(v_amount, v_debt);
  v_credit := v_amount - v_debt_recovered;

  update private.eixpay_wallets
  set balance = balance + v_credit,
      reward_debt = reward_debt - v_debt_recovered,
      lifetime_earned = lifetime_earned + v_amount,
      lifetime_spent = lifetime_spent + v_debt_recovered,
      updated_at = now(),
      last_activity_at = now()
  where user_id = p_user_id
  returning balance into v_new_balance;

  if v_credit > 0 then
    insert into private.eixpay_ledger
      (wallet_user_id, entry_kind, event_code, amount, balance_after, source_id, idempotency_key, actor_id, metadata)
    values
      (p_user_id, 'credit', p_event_code, v_credit, v_new_balance, p_source_id,
       p_idempotency_key || ':credit', p_actor_id,
       jsonb_build_object('claim_id', v_claim_id, 'reward_amount', v_amount, 'debt_recovered', v_debt_recovered));
  end if;

  if v_debt_recovered > 0 then
    insert into private.eixpay_ledger
      (wallet_user_id, entry_kind, event_code, amount, balance_after, source_id, idempotency_key, actor_id, metadata)
    values
      (p_user_id, 'debit', 'reward_debt_recovery', v_debt_recovered, v_new_balance, p_source_id,
       p_idempotency_key || ':debt', p_actor_id,
       jsonb_build_object('claim_id', v_claim_id, 'source_event', p_event_code));
  end if;

  return jsonb_build_object(
    'success', true,
    'awarded', v_amount,
    'debt_recovered', v_debt_recovered,
    'credited', v_credit,
    'balance_after', v_new_balance
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
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;

  return private.eixpay_apply_reward(
    p_user_id, p_event_code, p_source_id, p_idempotency_key, null, null
  );
end;
$function$;

create or replace function private.eixpay_reverse_order_reward(
  p_user_id uuid,
  p_order_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_claim private.eixpay_reward_claims%rowtype;
  v_balance bigint;
  v_debt bigint;
  v_deduct bigint;
  v_debt_added bigint;
  v_new_balance bigint;
  v_reversal_id uuid;
begin
  select * into v_claim
  from private.eixpay_reward_claims
  where user_id = p_user_id
    and event_code = 'delivered_order'
    and source_id = p_order_id
  for update;

  if not found then
    update private.eixpay_order_reward_queue
    set status = 'cancelled', cancelled_at = coalesce(cancelled_at, now()),
        last_result = 'order_returned_before_reward'
    where order_id = p_order_id and status in ('pending', 'blocked');
    return jsonb_build_object('success', true, 'reversed', false, 'reason', 'no_reward_claim');
  end if;

  insert into private.eixpay_reward_reversals
    (user_id, source_id, event_code, amount, idempotency_key)
  values
    (p_user_id, p_order_id, 'delivered_order', v_claim.amount, 'order-return:' || p_order_id::text)
  on conflict do nothing
  returning id into v_reversal_id;

  if v_reversal_id is null then
    return jsonb_build_object('success', true, 'duplicate', true);
  end if;

  select balance, reward_debt into v_balance, v_debt
  from private.eixpay_wallets
  where user_id = p_user_id
  for update;

  v_deduct := least(v_balance, v_claim.amount);
  v_debt_added := v_claim.amount - v_deduct;

  update private.eixpay_wallets
  set balance = balance - v_deduct,
      reward_debt = reward_debt + v_debt_added,
      lifetime_spent = lifetime_spent + v_claim.amount,
      updated_at = now(),
      last_activity_at = now()
  where user_id = p_user_id
  returning balance into v_new_balance;

  insert into private.eixpay_ledger
    (wallet_user_id, entry_kind, event_code, amount, balance_after, source_id, idempotency_key, metadata)
  values
    (p_user_id, 'reversal', 'delivered_order_reversal', v_claim.amount, v_new_balance,
     p_order_id, 'order-return:' || p_order_id::text,
     jsonb_build_object('reversal_id', v_reversal_id, 'debt_added', v_debt_added));

  update private.eixpay_order_reward_queue
  set status = 'reversed', reversed_at = now(), last_result = 'returned_order_reward_reversed'
  where order_id = p_order_id and status = 'awarded';

  return jsonb_build_object(
    'success', true, 'reversed', true,
    'amount', v_claim.amount, 'balance_after', v_new_balance, 'debt_added', v_debt_added
  );
end;
$function$;

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

alter table public.orders add column if not exists delivered_at timestamptz;

create or replace function private.neweix_plus_capture_delivery_time()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op = 'INSERT' then
    if new.status = 'delivered' and new.delivered_at is null then
      new.delivered_at := now();
    end if;
  else
    if new.status = 'delivered' and old.status is distinct from 'delivered' then
      new.delivered_at := coalesce(new.delivered_at, now());
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists neweix_plus_capture_delivery_time on public.orders;
create trigger neweix_plus_capture_delivery_time
before insert or update of status on public.orders
for each row execute function private.neweix_plus_capture_delivery_time();

update public.orders
set delivered_at = coalesce(delivered_at, updated_at)
where status = 'delivered' and delivered_at is null;

create or replace function private.neweix_plus_recalculate_memberships()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid;
  v_tier private.neweix_plus_tiers%rowtype;
  v_current private.neweix_plus_memberships%rowtype;
  v_target_tier text;
  v_changed integer := 0;
  v_qualifying_spend numeric;
  v_qualifying_orders bigint;
begin
  for v_user_id in
    select m.user_id
    from private.neweix_plus_memberships m
    where m.status = 'active'
    union
    select distinct o.customer_id
    from public.orders o
    where o.customer_id is not null
      and o.status = 'delivered'
      and o.payment_status = 'paid'
  loop
    v_qualifying_spend := 0;
    v_qualifying_orders := 0;
    perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

    update private.neweix_plus_memberships
    set status = 'expired'
    where user_id = v_user_id
      and status = 'active'
      and expires_at is not null
      and expires_at <= now();

    select * into v_current
    from private.neweix_plus_memberships
    where user_id = v_user_id and status = 'active'
    order by starts_at desc
    limit 1;

    -- A non-expired Supreme assignment is an explicit override.
    if found and v_current.assignment_source = 'supreme'
       and (v_current.expires_at is null or v_current.expires_at > now()) then
      continue;
    end if;

    v_target_tier := 'free';

    for v_tier in
      select *
      from private.neweix_plus_tiers
      where is_enabled = true
        and tier_rank > 0
        and (min_qualified_spend_bdt is not null or min_qualified_orders is not null)
      order by tier_rank desc
    loop
      select
        coalesce(sum(greatest(o.subtotal - coalesce(o.discount, 0), 0)), 0),
        count(*)
      into v_qualifying_spend, v_qualifying_orders
      from public.orders o
      where o.customer_id = v_user_id
        and o.status = 'delivered'
        and o.payment_status = 'paid'
        and o.delivery_fee_payment_status in ('paid', 'not_required')
        and o.delivered_at >= now() - make_interval(days => coalesce(v_tier.qualification_period_days, 30));

      if (v_tier.min_qualified_spend_bdt is null or v_qualifying_spend >= v_tier.min_qualified_spend_bdt)
         and (v_tier.min_qualified_orders is null or v_qualifying_orders >= v_tier.min_qualified_orders) then
        v_target_tier := v_tier.tier_code;
        exit;
      end if;
    end loop;

    if v_current.id is not null and v_current.tier_code = v_target_tier then
      continue;
    end if;

    if v_current.id is not null then
      update private.neweix_plus_memberships
      set status = 'expired',
          expires_at = case
            when expires_at is null or expires_at > now() then now()
            else expires_at
          end
      where id = v_current.id;
    end if;

    insert into private.neweix_plus_memberships
      (user_id, tier_code, status, starts_at, assignment_source, assignment_note)
    values
      (v_user_id, v_target_tier, 'active', now(), 'qualification',
       'Automatically calculated from paid and delivered orders within the tier qualification period.');

    insert into private.eixpay_audit_events (event_code, subject_id, metadata)
    values ('neweix_plus_membership_qualified', v_user_id,
      jsonb_build_object(
        'new_tier_code', v_target_tier,
        'qualified_spend_bdt', v_qualifying_spend,
        'qualified_orders', v_qualifying_orders
      ));

    v_changed := v_changed + 1;
  end loop;

  return v_changed;
end;
$function$;

do $neweix_plus_cron$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id from cron.job
  where jobname = 'neweix-plus-recalculate-memberships'
  limit 1;
  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
  perform cron.schedule(
    'neweix-plus-recalculate-memberships',
    '10 0 * * *',
    'select private.neweix_plus_recalculate_memberships();'
  );
end;
$neweix_plus_cron$;

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
    perform private.eixpay_reverse_order_reward(new.customer_id, new.id);
    return new;
  end if;

  if new.status = 'delivered'
     and new.payment_status = 'paid'
     and new.delivery_fee_payment_status in ('paid', 'not_required') then
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
        (order_id, user_id, reward_amount_snapshot, eligible_at)
      values
        (new.id, new.customer_id, v_rule.reward_amount,
         now() + make_interval(hours => v_rule.settlement_delay_hours))
      on conflict (order_id) do nothing;
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists eixpay_order_reward_eligibility on public.orders;
create trigger eixpay_order_reward_eligibility
after insert or update of status, payment_status, delivery_fee_payment_status
on public.orders
for each row execute function private.eixpay_watch_order_reward_eligibility();

do $eixpay_cron$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id
  from cron.job
  where jobname = 'eixpay-settle-order-rewards'
  limit 1;
  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
  perform cron.schedule(
    'eixpay-settle-order-rewards',
    '*/15 * * * *',
    'select private.eixpay_process_due_order_rewards();'
  );
end;
$eixpay_cron$;

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
  v_redemption_enabled boolean;
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

  select (p_transfer_enabled and transfer_legal_review_confirmed),
         (p_redemption_enabled and redemption_legal_review_confirmed)
  into v_transfer_enabled, v_redemption_enabled
  from private.eixpay_config
  where singleton = true;

  update private.eixpay_config
  set wallet_enabled = p_wallet_enabled,
      earning_enabled = p_earning_enabled,
      redemption_enabled = coalesce(v_redemption_enabled, false),
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
      'redemption_enabled', coalesce(v_redemption_enabled, false),
      'transfer_enabled', coalesce(v_transfer_enabled, false)
    ));

  return jsonb_build_object(
    'success', true,
    'wallet_enabled', p_wallet_enabled,
    'earning_enabled', p_earning_enabled,
    'redemption_enabled', coalesce(v_redemption_enabled, false),
    'transfer_enabled', coalesce(v_transfer_enabled, false),
    'transfer_requires_supreme_approval', true
  );
end;
$function$;

create or replace function public.eixpay_set_transfer_limits(
  p_min_amount bigint,
  p_max_amount bigint,
  p_daily_max_amount bigint,
  p_max_requests_per_day integer
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

  if p_min_amount is null or p_min_amount < 1
     or p_max_amount is null or p_max_amount < p_min_amount
     or p_daily_max_amount is null or p_daily_max_amount < p_max_amount
     or p_max_requests_per_day is null or p_max_requests_per_day < 1
     or p_max_requests_per_day > 50 then
    raise exception using errcode = '22023', message = 'INVALID_TRANSFER_LIMITS';
  end if;

  update private.eixpay_config
  set min_transfer_amount = p_min_amount,
      max_transfer_amount = p_max_amount,
      max_transfer_daily_amount = p_daily_max_amount,
      max_transfer_requests_per_day = p_max_requests_per_day,
      updated_by = v_actor,
      updated_at = now()
  where singleton = true;

  insert into private.eixpay_audit_events (actor_id, event_code, metadata)
  values (v_actor, 'transfer_limits_updated',
    jsonb_build_object(
      'min_transfer_amount', p_min_amount,
      'max_transfer_amount', p_max_amount,
      'max_transfer_daily_amount', p_daily_max_amount,
      'max_transfer_requests_per_day', p_max_requests_per_day
    ));

  return jsonb_build_object(
    'success', true,
    'min_transfer_amount', p_min_amount,
    'max_transfer_amount', p_max_amount,
    'max_transfer_daily_amount', p_daily_max_amount,
    'max_transfer_requests_per_day', p_max_requests_per_day
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

  -- Keep default membership creation race-safe across account and wallet requests.
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

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

create or replace function public.eixpay_supreme_get_dashboard()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_config jsonb;
  v_rules jsonb;
  v_tiers jsonb;
  v_stats jsonb;
begin
  if auth.uid() is null
     or not private.has_staff_role(array['supreme']::text[])
     or coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
    raise exception using errcode = '42501', message = 'SUPREME_MFA_REQUIRED';
  end if;

  select to_jsonb(c) into v_config
  from private.eixpay_config c
  where c.singleton = true;

  select coalesce(jsonb_agg(to_jsonb(r) order by r.event_code), '[]'::jsonb)
  into v_rules
  from private.eixpay_reward_rules r;

  select coalesce(jsonb_agg(to_jsonb(t) order by t.tier_rank), '[]'::jsonb)
  into v_tiers
  from private.neweix_plus_tiers t;

  select jsonb_build_object(
    'wallet_count', (select count(*) from private.eixpay_wallets),
    'total_eixon_balance', (select coalesce(sum(balance), 0) from private.eixpay_wallets),
    'pending_transfers', (select count(*) from private.eixpay_transfer_requests where status = 'pending'),
    'pending_redemptions', (select count(*) from private.eixpay_redemptions where status = 'pending'),
    'pending_order_rewards', (select count(*) from private.eixpay_order_reward_queue where status in ('pending','blocked')),
    'outstanding_reward_debt', (select coalesce(sum(reward_debt), 0) from private.eixpay_wallets)
  ) into v_stats;

  return jsonb_build_object(
    'program', v_config,
    'reward_rules', v_rules,
    'membership_tiers', v_tiers,
    'stats', v_stats
  );
end;
$function$;

create or replace function public.neweix_plus_set_tier(
  p_tier_code text,
  p_enabled boolean,
  p_min_qualified_spend_bdt bigint,
  p_min_qualified_orders integer,
  p_qualification_period_days integer,
  p_benefits jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_updated private.neweix_plus_tiers%rowtype;
begin
  if v_actor is null
     or not private.has_staff_role(array['supreme']::text[])
     or coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
    raise exception using errcode = '42501', message = 'SUPREME_MFA_REQUIRED';
  end if;

  if p_tier_code is null or p_tier_code not in ('free','silver','gold','platinum','diamond','vip')
     or p_enabled is null
     or p_min_qualified_spend_bdt < 0
     or p_min_qualified_orders < 0
     or p_qualification_period_days is null
     or p_qualification_period_days < 1 or p_qualification_period_days > 3650
     or p_benefits is null or jsonb_typeof(p_benefits) <> 'array'
     or jsonb_array_length(case when jsonb_typeof(p_benefits) = 'array' then p_benefits else '[]'::jsonb end) > 30
     or exists (
       select 1 from jsonb_array_elements(case when jsonb_typeof(p_benefits) = 'array' then p_benefits else '[]'::jsonb end) as item(value)
       where jsonb_typeof(item.value) <> 'string'
          or char_length(item.value #>> '{}') > 240
     ) then
    raise exception using errcode = '22023', message = 'INVALID_MEMBERSHIP_TIER_CONFIG';
  end if;

  if p_tier_code = 'free' and not p_enabled then
    raise exception using errcode = '22023', message = 'FREE_TIER_MUST_REMAIN_ENABLED';
  end if;

  if p_tier_code <> 'free' and p_enabled
     and p_min_qualified_spend_bdt is null
     and p_min_qualified_orders is null then
    raise exception using errcode = '22023', message = 'MEMBERSHIP_TIER_REQUIRES_A_QUALIFICATION_RULE';
  end if;

  if not p_enabled and exists (
    select 1 from private.neweix_plus_memberships
    where tier_code = p_tier_code and status = 'active'
  ) then
    raise exception using errcode = '55000', message = 'TIER_HAS_ACTIVE_MEMBERS';
  end if;

  update private.neweix_plus_tiers
  set is_enabled = p_enabled,
      min_qualified_spend_bdt = p_min_qualified_spend_bdt,
      min_qualified_orders = p_min_qualified_orders,
      qualification_period_days = p_qualification_period_days,
      benefits = p_benefits,
      updated_at = now()
  where tier_code = p_tier_code
  returning * into v_updated;

  if not found then
    raise exception using errcode = '22023', message = 'UNKNOWN_MEMBERSHIP_TIER';
  end if;

  insert into private.eixpay_audit_events (actor_id, event_code, metadata)
  values (v_actor, 'neweix_plus_tier_updated',
    jsonb_build_object(
      'tier_code', p_tier_code,
      'enabled', p_enabled,
      'min_qualified_spend_bdt', p_min_qualified_spend_bdt,
      'min_qualified_orders', p_min_qualified_orders,
      'qualification_period_days', p_qualification_period_days
    ));

  return jsonb_build_object('success', true, 'tier', to_jsonb(v_updated));
end;
$function$;

create or replace function public.neweix_plus_assign_member(
  p_user_id uuid,
  p_tier_code text,
  p_expires_at timestamptz default null,
  p_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_tier private.neweix_plus_tiers%rowtype;
  v_membership private.neweix_plus_memberships%rowtype;
begin
  if v_actor is null
     or not private.has_staff_role(array['supreme']::text[])
     or coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
    raise exception using errcode = '42501', message = 'SUPREME_MFA_REQUIRED';
  end if;

  if p_user_id is null or p_tier_code is null
     or coalesce(char_length(p_note), 0) > 500 then
    raise exception using errcode = '22023', message = 'INVALID_MEMBERSHIP_ASSIGNMENT';
  end if;

  select * into v_tier
  from private.neweix_plus_tiers
  where tier_code = p_tier_code and is_enabled = true;

  if not found then
    raise exception using errcode = '22023', message = 'MEMBERSHIP_TIER_NOT_AVAILABLE';
  end if;

  if p_expires_at is not null and p_expires_at <= now() then
    raise exception using errcode = '22023', message = 'MEMBERSHIP_EXPIRY_MUST_BE_IN_FUTURE';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  update private.neweix_plus_memberships
  set status = 'cancelled',
      assignment_note = coalesce(trim(p_note), 'Replaced by Supreme membership assignment.')
  where user_id = p_user_id and status = 'active';

  insert into private.neweix_plus_memberships
    (user_id, tier_code, status, starts_at, expires_at, assignment_source, assigned_by, assignment_note)
  values
    (p_user_id, p_tier_code, 'active', now(), p_expires_at, 'supreme', v_actor, coalesce(trim(p_note), ''))
  returning * into v_membership;

  insert into private.eixpay_audit_events (actor_id, event_code, subject_id, metadata)
  values (v_actor, 'neweix_plus_member_assigned', p_user_id,
    jsonb_build_object(
      'membership_id', v_membership.id,
      'tier_code', p_tier_code,
      'expires_at', p_expires_at,
      'note', coalesce(trim(p_note), '')
    ));

  return jsonb_build_object(
    'success', true,
    'membership_id', v_membership.id,
    'tier_code', v_membership.tier_code,
    'starts_at', v_membership.starts_at,
    'expires_at', v_membership.expires_at
  );
end;
$function$;

-- Functions are explicit APIs. No PUBLIC/anon execution; only signed-in users
-- or the trusted service role can run the matching operation.
revoke all on function private.neweix_plus_capture_delivery_time() from public, anon, authenticated, service_role;
revoke all on function private.neweix_plus_recalculate_memberships() from public, anon, authenticated, service_role;
revoke all on function private.eixpay_apply_reward(uuid, text, uuid, text, bigint, uuid) from public, anon, authenticated, service_role;
revoke all on function private.eixpay_reverse_order_reward(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function private.eixpay_process_due_order_rewards() from public, anon, authenticated, service_role;
revoke all on function private.eixpay_watch_order_reward_eligibility() from public, anon, authenticated, service_role;

revoke all on function public.eixpay_supreme_get_dashboard() from public, anon;
revoke all on function public.neweix_plus_set_tier(text, boolean, bigint, integer, integer, jsonb) from public, anon;
revoke all on function public.neweix_plus_assign_member(uuid, text, timestamptz, text) from public, anon;
grant execute on function public.eixpay_supreme_get_dashboard() to authenticated;
grant execute on function public.neweix_plus_set_tier(text, boolean, bigint, integer, integer, jsonb) to authenticated;
grant execute on function public.neweix_plus_assign_member(uuid, text, timestamptz, text) to authenticated;
revoke all on function public.eixpay_get_wallet() from public, anon;
revoke all on function public.eixpay_list_activity(integer, bigint) from public, anon;
revoke all on function public.eixpay_request_transfer(text, bigint, text, text) from public, anon;
revoke all on function public.eixpay_list_pending_transfers() from public, anon;
revoke all on function public.eixpay_decide_transfer(uuid, text, text) from public, anon;
revoke all on function public.eixpay_award_reward(uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function public.eixpay_set_transfer_limits(bigint, bigint, bigint, integer) from public, anon;
grant execute on function public.eixpay_set_transfer_limits(bigint, bigint, bigint, integer) to authenticated;
revoke all on function public.eixpay_set_program_config(boolean, boolean, boolean, boolean) from public, anon;
revoke all on function public.eixpay_set_reward_rule(text, boolean, bigint, integer) from public, anon;
revoke all on function public.neweix_plus_get_status() from public, anon;
revoke all on function public.eixverse_get_modules() from public, anon;

grant execute on function public.eixpay_get_wallet() to authenticated;
grant execute on function public.eixpay_list_activity(integer, bigint) to authenticated;
grant execute on function public.eixpay_request_transfer(text, bigint, text, text) to authenticated;
revoke all on function public.eixpay_list_my_transfers(integer) from public, anon;
revoke all on function public.eixpay_cancel_transfer(uuid) from public, anon;
grant execute on function public.eixpay_list_my_transfers(integer) to authenticated;
grant execute on function public.eixpay_cancel_transfer(uuid) to authenticated;
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
