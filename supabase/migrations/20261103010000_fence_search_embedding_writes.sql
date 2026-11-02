-- Ensure only the current lease owner can persist a generated product embedding.
-- Lock ordering is products -> queue, matching the product trigger's write path.
begin;

create or replace function private.enqueue_product_search_embedding()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op = 'DELETE' then
    delete from private.product_search_embedding_jobs where product_id = old.id;
    return old;
  end if;

  if new.is_active is true then
    insert into private.product_search_embedding_jobs(
      product_id, status, attempts, available_at, locked_until,
      lease_token, last_error, updated_at
    )
    values (new.id, 'pending', 0, pg_catalog.now(), null, null, null, pg_catalog.now())
    on conflict (product_id) do update
      set status = 'pending',
          attempts = 0,
          available_at = pg_catalog.now(),
          locked_until = null,
          lease_token = null,
          last_error = null,
          updated_at = pg_catalog.now();
  else
    delete from private.product_search_embedding_jobs where product_id = new.id;
  end if;
  return new;
end;
$function$;

create or replace function public.neweix_save_search_embedding(
  p_job_id uuid,
  p_product_id uuid,
  p_lease_token uuid,
  p_embedding extensions.vector(1024),
  p_model text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  product_is_active boolean;
  lease_is_current boolean;
begin
  if coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role') is distinct from 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_job_id is null or p_product_id is null or p_lease_token is null
     or p_embedding is null or p_model is null or pg_catalog.length(p_model) > 100 then
    raise exception 'INVALID_EMBEDDING_INPUT';
  end if;

  -- Match the lock order used by product updates and their enqueue trigger.
  select p.is_active into product_is_active
    from public.products p
   where p.id = p_product_id
   for update;
  if not found then
    return false;
  end if;

  select true into lease_is_current
    from private.product_search_embedding_jobs j
   where j.id = p_job_id
     and j.product_id = p_product_id
     and j.status = 'processing'
     and j.lease_token = p_lease_token
     and j.locked_until > pg_catalog.now()
   for update;
  if not found then
    return false;
  end if;

  if product_is_active then
    update public.products
       set search_embedding = p_embedding,
           search_embedding_model = p_model,
           search_embedding_updated_at = pg_catalog.now()
     where id = p_product_id;
  end if;

  delete from private.product_search_embedding_jobs
   where id = p_job_id and lease_token = p_lease_token;
  return true;
end;
$function$;

revoke all on function public.neweix_save_search_embedding(uuid, uuid, uuid, extensions.vector, text)
  from public, anon, authenticated;
grant execute on function public.neweix_save_search_embedding(uuid, uuid, uuid, extensions.vector, text)
  to service_role;

commit;
