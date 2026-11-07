# Supreme service API — Neweix Control Plane

## Architecture

Neweix is the only service control plane. Supreme is the sole Ruler identity and approval interface; it does not authenticate through Neweix Account. Eixon and Shop are subordinate service domains/adapters, not independent control planes.

Supreme's Android app calls only the Neweix server proxy. The proxy calls the Neweix Supabase Edge Function. That function validates the Supreme JWT at the Supabase gateway, requires fresh AAL2 and verifies the active attested device session through the authoritative Supreme session API. Only then may it invoke a subordinate adapter.

## Public server routes

- `GET /api/supreme/services/neweix/overview`
- `GET /api/supreme/services/eixon/overview`
- `GET /api/supreme/services/eixon/accounts`
- `GET /api/supreme/services/eixon/journal-entries`

All routes proxy to `supreme-neweix-api`. The Android client never calls the Eixon project directly and receives no Eixon database credentials or internal service secret.

## Internal Eixon channel

The Neweix Edge Function signs each fixed, read-only Eixon request with HMAC-SHA256. Eixon accepts only requests with a valid signature, a timestamp within 30 seconds, and a target path/query covered by the signature.

Set the same random secret (at least 32 characters) in both Supabase projects:
- Neweix project Edge Function secret: `NEWEIX_CONTROL_PLANE_SECRET`
- Eixon project Edge Function secret: `NEWEIX_CONTROL_PLANE_SECRET`

Set in Neweix project Edge Function secrets:
- `EIXON_SUPABASE_URL=https://fkptltfuivkniypknosa.supabase.co`
- `NEWEIX_CONTROL_PLANE_SECRET`
- `SUPREME_SESSION_API_URL=https://grhybvlhdnzlopwbaqun.supabase.co/functions/v1/supreme-session-api/session`

The Eixon Edge Function has `verify_jwt = false` only because it accepts a cross-project HMAC service identity instead of a Supreme JWT. It rejects unsigned/direct client requests. Financial writes remain disabled.

## Security boundary

- No arbitrary SQL/RPC forwarding.
- No service-role key or HMAC secret in Android, browser, or Cloudflare public variables.
- All current service capabilities are read-only and explicitly allowlisted.
- Eixon cannot authorize Supreme, create approvals, or act as a control plane.
- Future mutations must be named capabilities routed through Neweix, with approval bound to exact parameters, idempotency, durable audit, and service-side validation.
