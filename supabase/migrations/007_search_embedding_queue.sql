begin;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to postgres, service_role;

create table if not exists private.product_search_embedding_jobs (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null unique references public.products(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','processing','failed')),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  locked_until timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table private.product_search_embedding_jobs enable row level security;
revoke all on private.product_search_embedding_jobs from public, anon, authenticated;
grant all on private.product_search_embedding_jobs to service_role;
create index if not exists product_search_jobs_ready_idx
  on private.product_search_embedding_jobs(status, available_at, created_at);

create or replace function private.enqueue_product_search_embedding()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from private.product_search_embedding_jobs where product_id = old.id;
    return old;
  end if;

  if new.is_active is true then
    insert into private.product_search_embedding_jobs(product_id, status, attempts, available_at, locked_until, last_error, updated_at)
    values (new.id, 'pending', 0, now(), null, null, now())
    on conflict (product_id) do update
      set status = 'pending',
          attempts = 0,
          available_at = now(),
          locked_until = null,
          last_error = null,
          updated_at = now();
  else
    delete from private.product_search_embedding_jobs where product_id = new.id;
  end if;
  return new;
end;
$$;
revoke all on function private.enqueue_product_search_embedding() from public, anon, authenticated;

drop trigger if exists products_search_embedding_enqueue_insert on public.products;
create trigger products_search_embedding_enqueue_insert
after insert on public.products
for each row execute function private.enqueue_product_search_embedding();

drop trigger if exists products_search_embedding_enqueue_update on public.products;
create trigger products_search_embedding_enqueue_update
after update of name, description, sku, is_active on public.products
for each row
when (
  old.name is distinct from new.name or
  old.description is distinct from new.description or
  old.sku is distinct from new.sku or
  old.is_active is distinct from new.is_active
)
execute function private.enqueue_product_search_embedding();

drop trigger if exists products_search_embedding_enqueue_delete on public.products;
create trigger products_search_embedding_enqueue_delete
after delete on public.products
for each row execute function private.enqueue_product_search_embedding();

create or replace function public.neweix_claim_search_embedding_jobs(p_limit integer default 10)
returns table(job_id uuid, product_id uuid, attempts integer)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then
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
begin
  if current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then
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
declare updated_count integer;
begin
  if current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then
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

insert into private.product_search_embedding_jobs(product_id)
select p.id from public.products p where p.is_active = true
on conflict (product_id) do nothing;
commit;
