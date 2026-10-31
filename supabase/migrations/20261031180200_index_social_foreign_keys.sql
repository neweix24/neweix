-- These indexes depend on the social publishing foundation tables.
create index if not exists social_media_accounts_connected_by_idx
  on public.social_media_accounts(connected_by)
  where connected_by is not null;
create index if not exists social_media_deliveries_account_id_idx
  on public.social_media_deliveries(account_id)
  where account_id is not null;
create index if not exists social_media_posts_created_by_idx
  on public.social_media_posts(created_by)
  where created_by is not null;
create index if not exists social_media_posts_product_id_idx
  on public.social_media_posts(product_id)
  where product_id is not null;
