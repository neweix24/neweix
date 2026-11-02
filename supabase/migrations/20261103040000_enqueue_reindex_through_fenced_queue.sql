-- Reindex through the same fenced queue used by scheduled workers.
create or replace function public.neweix_enqueue_search_embedding_batch(
  p_offset integer default 0,
  p_limit integer default 10
)
returns table(queued integer, next_offset integer, complete boolean)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_count integer;
begin
  if current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_offset is null or p_offset < 0 or p_offset > 1000000
     or p_limit is null or p_limit < 1 or p_limit > 20 then
    raise exception 'INVALID_REINDEX_RANGE';
  end if;

  with batch as (
    select p.id
      from public.products p
     where p.is_active = true
     order by p.id
     offset p_offset
     limit p_limit
  ),
  upserted as (
    insert into private.product_search_embedding_jobs(
      product_id, status, attempts, available_at, locked_until,
      lease_token, last_error, updated_at
    )
    select b.id, 'pending', 0, pg_catalog.now(), null, null, null, pg_catalog.now()
      from batch b
    on conflict (product_id) do update
      set status = 'pending',
          attempts = 0,
          available_at = pg_catalog.now(),
          locked_until = null,
          lease_token = null,
          last_error = null,
          updated_at = pg_catalog.now()
    returning product_id
  )
  select pg_catalog.count(*)::integer into v_count from upserted;

  return query
  select
    v_count,
    case when v_count = p_limit then p_offset + v_count else null end,
    v_count < p_limit;
end;
$function$;

revoke all on function public.neweix_enqueue_search_embedding_batch(integer, integer)
  from public, anon, authenticated;
grant execute on function public.neweix_enqueue_search_embedding_batch(integer, integer)
  to service_role;
