begin;

-- PostgREST exposes JWT claims through request.jwt.claims. Depending on the
-- gateway/PostgREST version, the legacy request.jwt.claim.role setting may be
-- absent even for a valid service_role JWT. Accept either representation.
create or replace function public.neweix_claim_search_embedding_jobs(p_limit integer default 10)
returns table(job_id uuid, product_id uuid, attempts integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_role text;
begin
  request_role := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  );
  if request_role is distinct from 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  return query
  with picked as (
    select j.id
    from private.product_search_embedding_jobs j
    where j.attempts < 8
      and j.available_at <= now()
      and (j.status = 'pending' or (j.status = 'processing' and j.locked_until < now()))
    order by j.created_at
    for update skip locked
    limit least(greatest(coalesce(p_limit, 10), 1), 25)
  ), claimed as (
    update private.product_search_embedding_jobs j
    set status = 'processing',
        attempts = j.attempts + 1,
        locked_until = now() + interval '3 minutes',
        updated_at = now()
    from picked
    where j.id = picked.id
    returning j.id, j.product_id, j.attempts
  )
  select claimed.id, claimed.product_id, claimed.attempts from claimed;
end;
$$;
revoke all on function public.neweix_claim_search_embedding_jobs(integer) from public, anon, authenticated;
grant execute on function public.neweix_claim_search_embedding_jobs(integer) to service_role;

create or replace function public.neweix_complete_search_embedding_job(p_job_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_role text;
begin
  request_role := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  );
  if request_role is distinct from 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  delete from private.product_search_embedding_jobs where id = p_job_id;
  return found;
end;
$$;
revoke all on function public.neweix_complete_search_embedding_job(uuid) from public, anon, authenticated;
grant execute on function public.neweix_complete_search_embedding_job(uuid) to service_role;

create or replace function public.neweix_fail_search_embedding_job(p_job_id uuid, p_error text default 'Embedding generation failed')
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_role text;
  updated_count integer;
begin
  request_role := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  );
  if request_role is distinct from 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  update private.product_search_embedding_jobs
  set status = case when attempts >= 8 then 'failed' else 'pending' end,
      available_at = now() + make_interval(secs => least(3600, (power(2, greatest(attempts, 1))::integer) * 15)),
      locked_until = null,
      last_error = left(coalesce(p_error, 'Embedding generation failed'), 500),
      updated_at = now()
  where id = p_job_id;
  get diagnostics updated_count = row_count;
  return updated_count > 0;
end;
$$;
revoke all on function public.neweix_fail_search_embedding_job(uuid, text) from public, anon, authenticated;
grant execute on function public.neweix_fail_search_embedding_job(uuid, text) to service_role;

commit;
