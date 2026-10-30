begin;

alter table public.customer_profiles
  add column if not exists phone_verified_at timestamptz;

create unique index if not exists customer_profiles_verified_phone_uidx
  on public.customer_profiles (phone)
  where phone is not null and phone_verified_at is not null;

create table if not exists public.phone_verification_challenges (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  phone text not null,
  otp_hash text not null,
  attempts integer not null default 0 check (attempts between 0 and 5),
  expires_at timestamptz not null,
  sent_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint phone_verification_challenges_phone_format
    check (phone ~ '^\+8801[3-9][0-9]{8}$')
);

create index if not exists phone_verification_challenges_user_created_idx
  on public.phone_verification_challenges (user_id, created_at desc);
create index if not exists phone_verification_challenges_phone_created_idx
  on public.phone_verification_challenges (phone, created_at desc);

alter table public.phone_verification_challenges enable row level security;
revoke all on public.phone_verification_challenges from public, anon, authenticated;
grant all on public.phone_verification_challenges to service_role;

create or replace function public.consume_phone_verification_challenge(
  p_user_id uuid,
  p_challenge_id uuid,
  p_phone text,
  p_otp_hash text
)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_challenge public.phone_verification_challenges%rowtype;
begin
  select *
    into v_challenge
    from public.phone_verification_challenges
   where id = p_challenge_id
     and user_id = p_user_id
     and phone = p_phone
   for update;

  if not found then
    return 'invalid_challenge';
  end if;

  if v_challenge.consumed_at is not null then
    return 'already_used';
  end if;

  if v_challenge.sent_at is null then
    return 'not_sent';
  end if;

  if v_challenge.expires_at <= pg_catalog.now() then
    return 'expired';
  end if;

  if v_challenge.attempts >= 5 then
    return 'too_many_attempts';
  end if;

  if v_challenge.otp_hash is distinct from p_otp_hash then
    update public.phone_verification_challenges
       set attempts = attempts + 1
     where id = p_challenge_id;
    return 'invalid_otp';
  end if;

  begin
    insert into public.customer_profiles (
      user_id, phone, phone_verified_at, updated_at
    )
    values (
      p_user_id, p_phone, pg_catalog.now(), pg_catalog.now()
    )
    on conflict (user_id) do update
      set phone = excluded.phone,
          phone_verified_at = pg_catalog.now(),
          updated_at = pg_catalog.now();
  exception
    when unique_violation then
      update public.phone_verification_challenges
         set consumed_at = pg_catalog.now()
       where id = p_challenge_id;
      return 'phone_in_use';
  end;

  update public.phone_verification_challenges
     set consumed_at = pg_catalog.now()
   where id = p_challenge_id;

  return 'verified';
end;
$function$;

revoke all on function public.consume_phone_verification_challenge(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.consume_phone_verification_challenge(uuid, uuid, text, text)
  to service_role;

commit;
