# Supreme ↔ Neweix service API

## Routes

The Neweix Supabase Edge Function `supreme-neweix-api` is read-only:

- `GET /overview` — aggregate commerce, stock, order and warehouse totals.
- `GET /orders?limit=25&status=pending` — bounded order metadata, without customer PII.
- `GET /health` — service health.

The Next.js server proxy exposes:
- `GET /api/supreme/services/neweix/overview`

## Authorization

The Edge Function uses Supabase's JWT verification (`verify_jwt = true`) and independently checks:
- the sole active `supreme.identities` ruler record;
- fresh AAL2 (`auth_time` no older than five minutes);
- the server-signed `supreme_app_session` claim;
- the matching active, unexpired app session and device;
- Android package `com.neweix.supreme`, trusted-environment/StrongBox security, and attestation age.

The Next.js proxy repeats the AAL2 and database-backed active-session check before forwarding the user's access token. No service-role key is sent to the client.

## Write policy

This adapter is deliberately read-only. Orders, inventory, payment, staff, customer and delivery mutations must be added as individually named capabilities and require a Supreme control request approval bound to the exact operation and parameters. Do not add a generic arbitrary-RPC or SQL execution route.
