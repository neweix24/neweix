-- Server-issued, short-lived challenges for Supreme Android hardware attestation.
-- This table does not grant access; a later verifier must validate and consume a challenge.

create table if not exists public.supreme_app_attestation_challenges (
  id uuid primary key default gen_random_uuid(),
  challenge_hash text not null unique
    check (challenge_hash ~ '^[a-f0-9]{64}$'),
  requester_ip_hash text not null
    check (requester_ip_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  constraint supreme_attestation_challenge_expiry
    check (expires_at > created_at),
  constraint supreme_attestation_challenge_consumed
    check (consumed_at is null or consumed_at >= created_at)
);

create index if not exists supreme_attestation_challenges_ip_created_idx
  on public.supreme_app_attestation_challenges (requester_ip_hash, created_at desc);

create index if not exists supreme_attestation_challenges_expiry_idx
  on public.supreme_app_attestation_challenges (expires_at)
  where consumed_at is null;

alter table public.supreme_app_attestation_challenges enable row level security;

revoke all on table public.supreme_app_attestation_challenges from public, anon, authenticated;
grant select, insert, update, delete on table public.supreme_app_attestation_challenges to service_role;

-- Issue at most 10 challenges per source IP hash in any rolling 10-minute window.
-- Advisory locking makes the rate-limit check and insert atomic per source.
create or replace function public.issue_supreme_app_attestation_challenge(
  p_challenge_hash text,
  p_requester_ip_hash text,
  p_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_id uuid;
  v_now timestamptz := clock_timestamp();
  v_recent_count integer;
begin
  if p_challenge_hash is null
     or p_requester_ip_hash is null
     or p_expires_at is null
     or p_challenge_hash !~ '^[a-f0-9]{64}$'
     or p_requester_ip_hash !~ '^[a-f0-9]{64}$'
     or p_expires_at <= v_now
     or p_expires_at > v_now + interval '5 minutes 30 seconds' then
    raise exception 'invalid attestation challenge parameters'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_requester_ip_hash, 0));

  select count(*)::integer
    into v_recent_count
    from public.supreme_app_attestation_challenges
   where requester_ip_hash = p_requester_ip_hash
     and created_at > v_now - interval '10 minutes';

  if v_recent_count >= 10 then
    return null;
  end if;

  insert into public.supreme_app_attestation_challenges (
    challenge_hash,
    requester_ip_hash,
    created_at,
    expires_at
  ) values (
    p_challenge_hash,
    p_requester_ip_hash,
    v_now,
    p_expires_at
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.issue_supreme_app_attestation_challenge(text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.issue_supreme_app_attestation_challenge(text, text, timestamptz)
  to service_role;
