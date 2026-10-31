-- NEWEIX Social Media Publisher foundation.
-- OAuth tokens must be encrypted by the application before storage. Never store
-- provider access/refresh tokens in plaintext.
create table if not exists public.social_media_accounts (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('facebook','instagram','tiktok','youtube')),
  account_name text not null,
  external_account_id text not null,
  access_token_ciphertext text,
  refresh_token_ciphertext text,
  token_expires_at timestamptz,
  scopes text[] not null default '{}',
  connection_status text not null default 'pending'
    check (connection_status in ('pending','connected','expired','revoked','error')),
  connected_by uuid references auth.users(id) on delete set null,
  connected_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(platform, external_account_id)
);

create table if not exists public.social_media_posts (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  title text not null default '',
  caption text not null default '',
  media_urls text[] not null default '{}',
  post_targets text[] not null default '{}'
    check (post_targets <@ array['facebook','instagram','tiktok','youtube']::text[]),
  status text not null default 'draft'
    check (status in ('draft','scheduled','publishing','published','partial','failed','cancelled')),
  scheduled_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_post_schedule_required check (status <> 'scheduled' or scheduled_at is not null),
  constraint social_post_caption_length check (char_length(caption) <= 5000),
  constraint social_post_title_length check (char_length(title) <= 200),
  constraint social_post_media_limit check (cardinality(media_urls) <= 10)
);

create table if not exists public.social_media_deliveries (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.social_media_posts(id) on delete cascade,
  account_id uuid references public.social_media_accounts(id) on delete set null,
  platform text not null check (platform in ('facebook','instagram','tiktok','youtube')),
  status text not null default 'queued'
    check (status in ('queued','processing','published','failed','blocked')),
  provider_post_id text,
  provider_url text,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz,
  last_error text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(post_id, platform)
);

create index if not exists social_posts_status_schedule_idx
  on public.social_media_posts(status, scheduled_at);
create index if not exists social_deliveries_status_retry_idx
  on public.social_media_deliveries(status, next_attempt_at);
create index if not exists social_accounts_platform_status_idx
  on public.social_media_accounts(platform, connection_status);

alter table public.social_media_accounts enable row level security;
alter table public.social_media_posts enable row level security;
alter table public.social_media_deliveries enable row level security;

drop policy if exists social_accounts_admin_read on public.social_media_accounts;
create policy social_accounts_admin_read on public.social_media_accounts
for select to authenticated
using ((select private.has_staff_role(array['supreme','admin']::text[])));

drop policy if exists social_posts_admin_read on public.social_media_posts;
create policy social_posts_admin_read on public.social_media_posts
for select to authenticated
using ((select private.has_staff_role(array['supreme','admin']::text[])));

drop policy if exists social_posts_admin_insert on public.social_media_posts;
create policy social_posts_admin_insert on public.social_media_posts
for insert to authenticated
with check (
  (select private.has_staff_role(array['supreme','admin']::text[]))
  and created_by = (select auth.uid())
);

drop policy if exists social_posts_admin_update on public.social_media_posts;
create policy social_posts_admin_update on public.social_media_posts
for update to authenticated
using ((select private.has_staff_role(array['supreme','admin']::text[])))
with check ((select private.has_staff_role(array['supreme','admin']::text[])));

drop policy if exists social_deliveries_admin_read on public.social_media_deliveries;
create policy social_deliveries_admin_read on public.social_media_deliveries
for select to authenticated
using ((select private.has_staff_role(array['supreme','admin']::text[])));

-- Only the trusted Worker/service role may create or mutate delivery jobs.
revoke insert, update, delete on public.social_media_accounts from anon, authenticated;
revoke insert, update, delete on public.social_media_deliveries from anon, authenticated;
grant select on public.social_media_accounts, public.social_media_posts, public.social_media_deliveries to authenticated;
grant insert, update on public.social_media_posts to authenticated;
grant all on public.social_media_accounts, public.social_media_deliveries to service_role;
grant all on public.social_media_posts to service_role;

create or replace function public.neweix_claim_social_posts(p_limit integer default 10)
returns setof public.social_media_posts
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if p_limit < 1 or p_limit > 25 then
    raise exception 'Invalid batch size';
  end if;

  return query
  with due as (
    select p.id
    from public.social_media_posts p
    where p.status = 'scheduled'
      and p.scheduled_at <= now()
    order by p.scheduled_at asc
    for update skip locked
    limit p_limit
  )
  update public.social_media_posts p
  set status = 'publishing', updated_at = now()
  from due
  where p.id = due.id
  returning p.*;
end;
$function$;

revoke all on function public.neweix_claim_social_posts(integer) from public, anon, authenticated;
grant execute on function public.neweix_claim_social_posts(integer) to service_role;
