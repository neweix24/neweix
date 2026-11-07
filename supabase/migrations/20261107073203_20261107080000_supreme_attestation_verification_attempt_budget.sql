-- Bound concurrent/ repeated cryptographic verification work for each short-lived challenge.
-- Attempts are reserved atomically before fetching Google metadata or verifying certificates.
alter table public.supreme_app_attestation_challenges
  add column if not exists verification_attempts integer not null default 0;

alter table public.supreme_app_attestation_challenges
  add constraint supreme_attestation_verification_attempts_bound
  check (verification_attempts between 0 and 3);

create or replace function public.reserve_supreme_app_attestation_verification_attempt(
  p_challenge_id uuid,
  p_challenge_hash text,
  p_requester_ip_hash text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_reserved boolean := false;
  v_now timestamptz := clock_timestamp();
begin
  if p_challenge_id is null
     or p_challenge_hash is null
     or p_requester_ip_hash is null
     or p_challenge_hash !~ '^[a-f0-9]{64}$'
     or p_requester_ip_hash !~ '^[a-f0-9]{64}$' then
    return false;
  end if;

  -- UPDATE takes a row lock. Concurrent requests can reserve at most three
  -- attempts total; only requests matching the original IP binding qualify.
  update public.supreme_app_attestation_challenges
     set verification_attempts = verification_attempts + 1
   where id = p_challenge_id
     and challenge_hash = p_challenge_hash
     and requester_ip_hash = p_requester_ip_hash
     and consumed_at is null
     and expires_at > v_now
     and verification_attempts < 3
  returning true into v_reserved;

  return coalesce(v_reserved, false);
end;
$$;

revoke all on function public.reserve_supreme_app_attestation_verification_attempt(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.reserve_supreme_app_attestation_verification_attempt(uuid, text, text)
  to service_role;
