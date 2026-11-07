# Supreme Android attestation verification endpoint

## Purpose

This milestone adds a server-to-server verifier endpoint for the private Supreme Android app. It validates a fresh Android Key Attestation chain and proof of possession, then atomically consumes the server-issued challenge.

It is deliberately **not an authentication endpoint**:

- It does not sign in a Supabase user.
- It does not create or refresh a Supabase session.
- It does not grant the `supreme` role.
- It does not bypass the Supreme password or AAL2 MFA requirements.
- It does not authorize the Supreme dashboard or issue an attested-device cookie.

The Supreme login UI and middleware therefore remain fail-closed until a separate session-binding and AAL2 integration is implemented.

## Request flow

1. The Android app requests a nonce from `POST /api/supreme/attestation/challenge`.
2. The app creates a hardware-backed P-256 Android Keystore key and obtains the leaf-first certificate chain and domain-separated challenge proof.
3. The app posts the challenge ID, base64url challenge, base64 certificate chain, and DER ECDSA proof signature to `POST /api/supreme/attestation/verify`.
4. The Next.js route applies a strict 96 KiB body limit and proxies the request to the Supabase Edge Function. It adds the service-role credential server-side; it never forwards that credential to the app.
5. The Edge Function requires the exact server-side service-role credential and rejects all other callers.
6. The handler validates the request shape and sizes, hashes the challenge, and reserves a verification attempt through a database RPC before fetching external metadata or doing expensive cryptographic work.
7. The reservation is an atomic row update bound to the challenge ID, challenge hash, original requester IP hash, unconsumed state, and expiry. A challenge allows at most three verification attempts, including concurrent requests. Failed attempts do not consume the challenge, preserving a small retry window for transient upstream failures.
8. The verifier fetches Google's current root and status feeds, validates freshness, validates the Android-specific X.509 chain and revocation status, enforces the package and production APK signer policy, validates hardware-backed KeyDescription and RootOfTrust, and verifies proof of possession.
9. Only after every cryptographic and policy check succeeds does the handler call `consume_supreme_app_attestation_challenge`. The database conditional update is the replay fence.
10. A successful response reports verification facts only. It is not a login token.

## Required server configuration

The Supabase Edge Function requires these platform-provided variables:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

It also requires these project secrets:

- `SUPREME_ANDROID_SIGNING_CERT_SHA256`: the SHA-256 digest of the **permanent production APK signing certificate**, 64 lowercase or uppercase hexadecimal characters with no separators. Never use the debug APK digest.
- `SUPREME_ANDROID_MIN_VERSION_CODE`: positive minimum Android app versionCode.

If either Supreme policy value is absent or invalid, the endpoint returns 503 and does not consume a challenge. Do not add a debug signer digest to production secrets.

The function uses `verify_jwt = true` at the Supabase gateway and also checks that both the Authorization bearer and apikey headers match the server-side service-role key. The public Next.js proxy is the only intended caller.

## Database dependencies

The function depends on these migrations being applied to the target Supabase database:

- `20261107030000_supreme_android_attestation_challenges.sql`
- `20261107043000_supreme_android_attestation_challenge_consume.sql`
- `20261107080000_supreme_attestation_verification_attempt_budget.sql`

The production project has not yet been migrated with these tables/RPCs. Until the migrations are separately reviewed and applied, the endpoint cannot complete verification. This PR does not apply any production database migration.

Challenge issuance is rate-limited to 10 challenges per source-IP hash per rolling 10-minute window. Verification attempts are independently capped at three per challenge using an atomic database reservation bound to the original requester IP hash. The attempt budget limits concurrent cryptographic work amplification; challenge consumption remains a separate atomic operation that occurs only after successful verification.

## Runtime and release gates

The verifier runs in Supabase Edge Functions rather than on the Cloudflare Worker CPU budget. Supabase currently documents a 256 MB memory limit, 2 seconds of CPU time per request, and a 150-second Free-plan wall-clock limit. The existing benchmark numbers were collected on GitHub-hosted runners only; they are not proof of Supabase Edge Runtime compliance.

Before deployment or login enablement:

1. Run the full verifier under the actual Supabase Edge Runtime and record CPU/memory behavior.
2. Apply and verify the two challenge migrations in production.
3. Configure the permanent production APK signer digest and minimum version code.
4. Wire a short-lived attested-device session to the same Supabase user and AAL2 session.
5. Implement native app attestation transport and test on a real Android device.
6. Keep Supreme login disabled until all gates pass.

## Failure behavior

Malformed input, invalid chains, stale Google metadata, wrong signer identity, invalid RootOfTrust, invalid proof, expired challenges, replay, missing secrets, and database failures all fail closed. No failure path creates an Auth session or grants access.
