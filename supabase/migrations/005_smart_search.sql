-- NEWEIX Smart Search foundation.
begin;
create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists vector with schema extensions;
alter table public.products add column if not exists search_embedding extensions.vector(1024), add column if not exists search_embedding_model text, add column if not exists search_embedding_updated_at timestamptz;
create index if not exists products_search_name_trgm_idx on public.products using gin (lower(name) extensions.gin_trgm_ops);
create index if not exists products_search_description_trgm_idx on public.products using gin (lower(coalesce(description, '')) extensions.gin_trgm_ops);
create index if not exists products_search_sku_trgm_idx on public.products using gin (lower(coalesce(sku, '')) extensions.gin_trgm_ops);
create index if not exists products_search_embedding_hnsw_idx on public.products using hnsw (search_embedding extensions.vector_cosine_ops) where search_embedding is not null;
commit;
