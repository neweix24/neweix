-- Global concurrency and minimum-interval gate for scheduled/manual search embedding batches.
begin;

create table if not exists private.search_embedding_processor_gate (
  singleton boolean primary key default true check (singleton),
  lease_token uuid,
  locked_until timestamptz,
  last_started_at timestamptz
);

insert into private.search_embedding_processor_gate(singleton)
values (true)
on conflict (singleton) do nothing;

alter table private.search_embedding_processor_gate enable row level security;
revoke all on table private.search_embedding_processor_gate
  from public, anon, authenticated, service_role;

create or replace function public.neweix_acquire_search_embedding_gate(
  p_min_interval_seconds integer default 30,
  p_lease_seconds integer default 600
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_gate private.search_embedding_processor_gate%rowtype;
  v_token uuid;
begin
  if current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_min_interval_seconds is null or p_min_interval_seconds < 5 or p_min_interval_seconds > 300
     or p_lease_seconds is null or p_lease_seconds < 60 or p_lease_seconds > 900 then
    raise exception 'INVALID_SEARCH_GATE_LIMITS';
  end if;

  insert into private.search_embedding_processor_gate(singleton)
  values (true)
  on conflict (singleton) do nothing;

  select * into v_gate
    from private.search_embedding_processor_gate
   where singleton = true
   for update;

  if v_gate.lease_token is not null
     and v_gate.locked_until > pg_catalog.now() then
    return null;
  end if;

  if v_gate.last_started_at is not null
     and v_gate.last_started_at > pg_catalog.now() - make_interval(secs => p_min_interval_seconds) then
    return null;
  end if;

  v_token := pg_catalog.gen_random_uuid();
  update private.search_embedding_processor_gate
     set lease_token = v_token,
         locked_until = pg_catalog.now() + make_interval(secs => p_lease_seconds),
         last_started_at = pg_catalog.now()
   where singleton = true;

  return v_token;
end;
$function$;

create or replace function public.neweix_release_search_embedding_gate(p_lease_token uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  affected integer;
begin
  if current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  update private.search_embedding_processor_gate
     set lease_token = null,
         locked_until = null
   where singleton = true
     and lease_token = p_lease_token;
  get diagnostics affected = row_count;
  return affected = 1;
end;
$function$;

revoke all on function public.neweix_acquire_search_embedding_gate(integer, integer)
  from public, anon, authenticated;
revoke all on function public.neweix_release_search_embedding_gate(uuid)
  from public, anon, authenticated;
grant execute on function public.neweix_acquire_search_embedding_gate(integer, integer)
  to service_role;
grant execute on function public.neweix_release_search_embedding_gate(uuid)
  to service_role;

commit;
