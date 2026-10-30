# NEWEIX Smart Search rollout

1. Apply `supabase/migrations/005_smart_search.sql`.
2. Apply `supabase/migrations/006_smart_search_rpc.sql`.
3. Deploy the Cloudflare Worker with the `AI` binding in `wrangler.jsonc`.
4. Sign in as admin or supreme and POST to `/api/admin/search/reindex` with `{"offset":0,"limit":10}`. Continue with the returned `nextOffset` until `complete` is true.
5. Re-run the backfill after product name, SKU or description changes. Automatic re-embedding on product mutations is a follow-up task.

The public `/api/search` endpoint uses Workers AI `@cf/baai/bge-m3` for query embeddings and falls back to keyword/trigram matching if AI is unavailable. Semantic product retrieval becomes useful after product embeddings are populated. Product price and stock always come from PostgreSQL, not AI output. Checkout, payment and inventory deduction are not changed.

Test exact SKU, Bengali, English, Banglish and typo queries before production rollout. Bengali transliteration needs a curated synonym/alias dictionary and evaluation against real NEWEIX queries.

## Automatic embedding refresh after product changes

- Migration `007_search_embedding_queue.sql` creates a private queue and database triggers. New active products and changes to product name, description, SKU or active state automatically enqueue embedding work. Existing active products are queued once during migration.
- Migration `008_search_embedding_queue_service_policy.sql` restricts queue-table access to the service role.
- An admin or supreme user can POST to `/api/admin/search/process-queue` with `{ "limit": 10 }`. Repeat until the response reports `processed: 0`. The endpoint claims jobs atomically, generates BGE-M3 embeddings, stores vectors, and retries transient failures with exponential backoff. It is not yet scheduled; it must be invoked by an operator or a later Cloudflare Cron integration.
- Queue processing requires a deployed Worker with the `AI` binding and server-side `SUPABASE_SERVICE_ROLE_KEY` secret. Never expose that secret to the browser.


## Scheduled embedding queue processing

- `worker.ts` is the custom OpenNext Worker entrypoint. It forwards HTTP traffic to the generated OpenNext fetch handler and implements a Cloudflare `scheduled()` handler.
- `wrangler.jsonc` now points `main` to `worker.ts` and configures `*/15 * * * *` (every 15 minutes, UTC). Each invocation claims up to 10 jobs, generates BGE-M3 embeddings with the `AI` binding, persists vectors, and completes or retries jobs through the service-role-only RPCs.
- This schedule requires a new Cloudflare deployment to become active. Cron Trigger changes can take up to 15 minutes to propagate. Confirm execution in Cloudflare Workers > NEWEIX > Triggers / Observability.
- The admin endpoint `/api/admin/search/process-queue` remains available for manual processing and diagnostics; routine queue processing no longer depends on an admin being logged in.
- The Worker requires the existing server-side `SUPABASE_SERVICE_ROLE_KEY` secret plus `NEXT_PUBLIC_SUPABASE_URL` and the Workers AI binding. The service-role key is never sent to the browser.
