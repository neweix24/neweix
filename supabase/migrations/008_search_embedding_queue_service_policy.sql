begin;
drop policy if exists "service role manages product search embedding jobs" on private.product_search_embedding_jobs;
create policy "service role manages product search embedding jobs"
on private.product_search_embedding_jobs
for all
to service_role
using (true)
with check (true);
commit;
