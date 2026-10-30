# NEWEIX Smart Search rollout

1. Apply `supabase/migrations/005_smart_search.sql`.
2. Apply `supabase/migrations/006_smart_search_rpc.sql`.
3. Deploy the Cloudflare Worker with the `AI` binding in `wrangler.jsonc`.
4. Sign in as admin or supreme and POST to `/api/admin/search/reindex` with `{"offset":0,"limit":10}`. Continue with the returned `nextOffset` until `complete` is true.
5. Re-run the backfill after product name, SKU or description changes. Automatic re-embedding on product mutations is a follow-up task.

The public `/api/search` endpoint uses Workers AI `@cf/baai/bge-m3` for query embeddings and falls back to keyword/trigram matching if AI is unavailable. Semantic product retrieval becomes useful after product embeddings are populated. Product price and stock always come from PostgreSQL, not AI output. Checkout, payment and inventory deduction are not changed.

Test exact SKU, Bengali, English, Banglish and typo queries before production rollout. Bengali transliteration needs a curated synonym/alias dictionary and evaluation against real NEWEIX queries.