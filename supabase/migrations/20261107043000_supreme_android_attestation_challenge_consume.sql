-- Atomically consume a verified Supreme Android attestation challenge.
-- This RPC does not verify certificates and does not grant authentication.
create or replace function public.consume_supreme_app_attestation_challenge(
  p_challenge_id uuid,
  p_challenge_hash text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_consumed boolean := false;
  v_now timestamptz := clock_timestamp();
begin
  if p_challenge_id is null
     or p_challenge_hash is null
     or p_challenge_hash !~ '^[a-f0-9]{64}$' then
    return false;
  end if;

  -- The conditional UPDATE is the replay fence: concurrent requests contend
  -- on the same row, and only one can transition consumed_at from NULL.
  update public.supreme_app_attestation_challenges
     set consumed_at = v_now
   where id = p_challenge_id
     and challenge_hash = p_challenge_hash
     and consumed_at is null
     and expires_at > v_now
  returning true into v_consumed;

  return coalesce(v_consumed, false);
end;
$$;

revoke all on function public.consume_supreme_app_attestation_challenge(uuid, text)
  from public, anon, authenticated;
grant execute on function public.consume_supreme_app_attestation_challenge(uuid, text)
  to service_role;
