# NEWEIX Smart Search Operations

## Production requirements

- Database search migrations must be applied through the repository's approved migration process. Do not apply only the original search migrations or run `supabase db push` against production until the historical migration registry has been reconciled.
- Cloudflare Worker must have the `AI` binding in `wrangler.jsonc`.
- The Worker requires the existing server-side `SUPABASE_SERVICE_ROLE_KEY` secret plus `NEXT_PUBLIC_SUPABASE_URL`. The service-role key is never exposed to the browser.

## Search behavior

- The public `/api/search` endpoint uses Workers AI `@cf/baai/bge-m3` for query embeddings and falls back to keyword/trigram matching when AI is unavailable.
- Semantic product retrieval improves after product embeddings are populated. Product price, stock, and checkout data always come from PostgreSQL, not AI output.
- Test exact SKU, Bengali, English, Banglish, and typo queries before production rollout. Bengali transliteration still benefits from a curated synonym/alias dictionary and evaluation against real NEWEIX queries.

## Automatic embedding updates

- Migration `007_search_embedding_queue.sql` creates the private embedding queue and database triggers. New active products and changes to product name, description, SKU, or active state automatically enqueue embedding work. Existing active products are queued for initial indexing.
- Migration `008_search_embedding_queue_service_policy.sql` and subsequent queue hardening migrations restrict queue access to service-role functions.
- `worker.ts` is the custom OpenNext Worker entrypoint. It forwards HTTP requests to the generated OpenNext fetch handler and processes background queues from its Cloudflare `scheduled()` handler.
- `wrangler.jsonc` configures `*/15 * * * *` for search embedding and scheduled social publishing. Each search run claims up to 10 jobs, generates BGE-M3 embeddings, persists vectors, and completes or retries jobs through service-role-only RPCs.
- Routine queue processing is automatic; an admin does not need to stay signed in and does not need to invoke the manual endpoint.

## Manual operations

- An Admin or Supreme user can POST to `/api/admin/search/process-queue` with `{ "limit": 10 }` to manually process a batch or diagnose a queue issue. Repeat only when needed until the response reports `processed: 0`.
- An Admin or Supreme user can POST to `/api/admin/search/reindex` with `{ "offset": 0, "limit": 10 }` to force a full embedding rebuild. Continue with the returned `nextOffset` until `complete` is true. This is a maintenance operation, not the normal refresh path.
- Both endpoints require a valid staff session; Supreme access additionally requires completed MFA. Never call them from public storefront code.

## Operations checks

- Cron Trigger changes can take up to 15 minutes to propagate after deployment. Confirm execution in Cloudflare Workers > NEWEIX > Triggers / Observability.
- If the AI binding is unavailable, public search continues using keyword/trigram matching. Queue jobs remain retryable and are not silently marked as indexed.
