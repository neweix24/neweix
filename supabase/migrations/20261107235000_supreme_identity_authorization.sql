-- Supreme authorization must use the standalone ruler identity and an active attested app session.
-- This deliberately does not recreate or query public.staff_profiles.

create or replace function public.supreme_is_current_identity()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    auth.uid() is not null
    and exists (
      select 1
      from supreme.identities i
      where i.user_id = (select auth.uid())
        and i.public_id = 'supreme'
        and i.role = 'ruler'
        and i.is_active = true
    )
    and (
      select count(*)
      from supreme.identities i
      where i.public_id = 'supreme'
        and i.role = 'ruler'
        and i.is_active = true
    ) = 1;
$$;

create or replace function public.supreme_has_active_attested_session()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with claims as (
    select auth.jwt() as value
  ),
  binding as (
    select
      value,
      value -> 'supreme_app_session' as app_session,
      nullif(value ->> 'session_id', '')::uuid as auth_session_id,
      nullif(value ->> 'auth_time', '')::bigint as auth_time
    from claims
  )
  select
    auth.uid() is not null
    and exists (
      select 1
      from binding b
      join supreme.identities i
        on i.user_id = (select auth.uid())
       and i.public_id = 'supreme'
       and i.role = 'ruler'
       and i.is_active = true
      join supreme.app_sessions s
        on s.user_id = i.user_id
       and s.auth_session_id = b.auth_session_id
       and s.id = nullif(b.app_session ->> 'session_id', '')::uuid
       and s.device_id = nullif(b.app_session ->> 'device_id', '')::uuid
       and s.status = 'active'
       and s.expires_at > now()
      join supreme.devices d
        on d.id = s.device_id
       and d.user_id = i.user_id
       and d.status = 'active'
       and d.app_package = 'com.neweix.supreme'
       and d.security_level in ('trusted_environment', 'strongbox')
       and d.attested_at > now() - interval '30 days'
      where b.value ->> 'aal' = 'aal2'
        and b.app_session ->> 'status' = 'active'
        and b.auth_time is not null
        and extract(epoch from now()) - b.auth_time between 0 and 300
    )
    and (
      select count(*)
      from supreme.identities i
      where i.public_id = 'supreme'
        and i.role = 'ruler'
        and i.is_active = true
    ) = 1;
$$;

revoke all on function public.supreme_is_current_identity() from public, anon;
revoke all on function public.supreme_has_active_attested_session() from public, anon;
grant execute on function public.supreme_is_current_identity() to authenticated;
grant execute on function public.supreme_has_active_attested_session() to authenticated;

create or replace function private.has_staff_role(required_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    'supreme' = any(coalesce(required_roles, array[]::text[]))
    and public.supreme_has_active_attested_session();
$$;

revoke all on function private.has_staff_role(text[]) from public, anon;
grant execute on function private.has_staff_role(text[]) to authenticated;

-- These two legacy moderation RPCs checked the deleted staff_profiles table directly.
-- Rewrite only the authorization predicate; preserve their existing business logic.
do $$
declare
  v_signature regprocedure;
  v_definition text;
  v_updated text;
begin
  foreach v_signature in array array[
    'public.eixpay_supreme_list_product_reviews()'::regprocedure,
    'public.eixpay_supreme_decide_product_review(uuid,text,text)'::regprocedure
  ]
  loop
    select pg_get_functiondef(v_signature) into v_definition;
    v_updated := regexp_replace(
      v_definition,
      'not exists \(\s*select 1 from public\.staff_profiles\s+where user_id = v_actor and role = ''supreme'' and is_active = true\s*\)',
      'not private.has_staff_role(array[''supreme'']::text[])',
      'g'
    );
    if v_updated = v_definition then
      raise exception 'Could not safely update Supreme authorization in %', v_signature;
    end if;
    execute v_updated;
  end loop;
end;
$$;
