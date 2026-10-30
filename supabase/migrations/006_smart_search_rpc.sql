create or replace function public.neweix_search_products(p_query text default '', p_query_embedding extensions.vector(1024) default null, p_category_id uuid default null, p_min_price integer default null, p_max_price integer default null, p_in_stock boolean default false, p_sort text default 'relevance', p_limit integer default 24, p_offset integer default 0)
returns table(id uuid,name text,slug text,description text,price numeric,compare_at_price numeric,image_urls text[],stock integer,category_id uuid,sku text,is_featured boolean,created_at timestamptz,relevance_score double precision)
language sql stable security invoker set search_path = '' as $$
with q as (select lower(btrim(coalesce(p_query,''))) term), candidates as (
 select p.id,p.name,p.slug,p.description,p.price,p.compare_at_price,p.image_urls,p.stock,p.category_id,p.sku,p.is_featured,p.created_at,
 case when q.term='' then 0.0 else
 (case when lower(p.name)=q.term then 100.0 else 0 end)+(case when lower(coalesce(p.sku,''))=q.term then 120.0 else 0 end)+
 (case when lower(p.name) like q.term||'%' then 25.0 else 0 end)+(case when lower(coalesce(p.sku,'')) like q.term||'%' then 30.0 else 0 end)+
 (case when lower(p.name) like '%'||q.term||'%' then 12.0 else 0 end)+(case when lower(coalesce(p.description,'')) like '%'||q.term||'%' then 2.0 else 0 end)+
 (case when lower(coalesce(p.sku,'')) like '%'||q.term||'%' then 18.0 else 0 end)+
 (greatest(extensions.similarity(lower(p.name),q.term),extensions.similarity(lower(coalesce(p.sku,'')),q.term))*8.0)+
 (case when p_query_embedding is not null and p.search_embedding is not null then greatest(0.0,1.0-(p.search_embedding <=> p_query_embedding))*20.0 else 0 end) end score
 from public.products p cross join q where p.is_active=true and (p_category_id is null or p.category_id=p_category_id)
 and (p_min_price is null or p.price>=p_min_price) and (p_max_price is null or p.price<=p_max_price) and (not p_in_stock or p.stock>0)
 and (q.term='' or lower(p.name) like '%'||q.term||'%' or lower(coalesce(p.description,'')) like '%'||q.term||'%' or lower(coalesce(p.sku,'')) like '%'||q.term||'%' or lower(p.name) OPERATOR(extensions.%) q.term or lower(coalesce(p.sku,'')) OPERATOR(extensions.%) q.term or (p_query_embedding is not null and p.search_embedding is not null and (p.search_embedding <=> p_query_embedding)<0.65))
)
select c.id,c.name,c.slug,c.description,c.price,c.compare_at_price,c.image_urls,c.stock,c.category_id,c.sku,c.is_featured,c.created_at,c.score from candidates c
order by case when p_sort='price_asc' then c.price end asc nulls last,case when p_sort='price_desc' then c.price end desc nulls last,case when p_sort='newest' then c.created_at end desc nulls last,c.score desc,c.is_featured desc,c.created_at desc
limit least(greatest(coalesce(p_limit,24),1),50) offset greatest(coalesce(p_offset,0),0);
$$;
revoke all on function public.neweix_search_products(text,extensions.vector,uuid,integer,integer,boolean,text,integer,integer) from public;
grant execute on function public.neweix_search_products(text,extensions.vector,uuid,integer,integer,boolean,text,integer,integer) to anon,authenticated;
