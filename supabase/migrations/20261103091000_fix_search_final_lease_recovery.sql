create or replace function public.neweix_claim_search_embedding_jobs_v2(p_limit integer default 10)
returns table(job_id uuid, product_id uuid, attempts integer, lease_token uuid)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role') is distinct from 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  update private.product_search_embedding_jobs as q
     set status = 'failed',
         lease_token = null,
         locked_until = null,
         last_error = coalesce(q.last_error, 'Embedding worker lease expired after final attempt'),
         updated_at = pg_catalog.now()
   where q.attempts >= 8
     and (
       (q.status = 'processing' and q.locked_until <= pg_catalog.now())
       or q.status = 'pending'
     );

  return query
  with picked as (
    select j.id
      from private.product_search_embedding_jobs j
     where j.attempts < 8
       and j.available_at <= pg_catalog.now()
       and (j.status = 'pending' or (j.status = 'processing' and j.locked_until < pg_catalog.now()))
     order by j.created_at
     for update skip locked
     limit least(greatest(coalesce(p_limit, 10), 1), 25)
  ),
  claimed as (
    update private.product_search_embedding_jobs j
       set status = 'processing',
           attempts = j.attempts + 1,
           lease_token = pg_catalog.gen_random_uuid(),
           locked_until = pg_catalog.now() + interval '3 minutes',
           updated_at = pg_catalog.now()
      from picked
     where j.id = picked.id
    returning j.id, j.product_id, j.attempts, j.lease_token
  )
  select claimed.id, claimed.product_id, claimed.attempts, claimed.lease_token
    from claimed;
end;
$function$;