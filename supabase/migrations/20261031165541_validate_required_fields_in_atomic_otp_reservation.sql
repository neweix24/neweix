create or replace function public.reserve_phone_verification_challenge(
  p_challenge_id uuid,
  p_user_id uuid,
  p_phone text,
  p_otp_hash text,
  p_expires_at timestamptz
)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_now timestamptz := pg_catalog.now();
  v_user_count integer;
  v_phone_count integer;
  v_last_created timestamptz;
begin
  if p_challenge_id is null or p_user_id is null or p_phone is null
     or p_otp_hash is null or p_expires_at is null
     or p_phone !~ '^\+8801[3-9][0-9]{8}$'
     or p_otp_hash !~ '^[0-9a-f]{64}$'
     or p_expires_at <= v_now
     or p_expires_at > v_now + interval '10 minutes' then
    return 'invalid_input';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('phone-otp-user:' || p_user_id::text, 0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('phone-otp-phone:' || p_phone, 0));
  select count(*)::integer into v_user_count
    from public.phone_verification_challenges
   where user_id=p_user_id and created_at >= v_now - interval '24 hours';
  if v_user_count >= 5 then return 'user_daily_limit'; end if;
  select count(*)::integer,max(created_at) into v_phone_count,v_last_created
    from public.phone_verification_challenges
   where phone=p_phone and created_at >= v_now - interval '24 hours';
  if v_phone_count >= 10 then return 'phone_daily_limit'; end if;
  if v_last_created is not null and v_last_created > v_now - interval '60 seconds' then return 'cooldown'; end if;
  insert into public.phone_verification_challenges(id,user_id,phone,otp_hash,expires_at)
  values(p_challenge_id,p_user_id,p_phone,p_otp_hash,p_expires_at);
  return 'reserved';
end;
$function$;

revoke all on function public.reserve_phone_verification_challenge(uuid,uuid,text,text,timestamptz)
  from public,anon,authenticated;
grant execute on function public.reserve_phone_verification_challenge(uuid,uuid,text,text,timestamptz)
  to service_role;
