# Supreme Android attested-session binding design

## Current implementation boundary

The repository now contains:

- A server-issued, short-lived Android attestation challenge.
- A server-side Android/X.509 verifier with Google root and revocation checks.
- A same-origin Cloudflare/Next proxy to the Supabase Edge Function.
- A native Android biometric/device-credential app lock.
- A private Supreme login holding page.

The deployed verifier is **not an authentication mechanism**. It verifies a device proof and consumes a challenge, but it does not create a Supabase Auth session, bind a device to a user, issue a session cookie, grant the Supreme role, or authorize the dashboard. Production challenge migrations are not applied, so the verifier currently fails closed before cryptographic verification can complete.

## Required login and attestation sequence

1. **Native app lock:** Android `BiometricPrompt` requires fingerprint or the device PIN/pattern/password before the WebView is exposed.
2. **Supreme password login:** The dedicated app-only page signs in the one Supreme identity. The shared staff login continues to reject the Supreme role.
3. **AAL2 MFA:** The user completes Supabase MFA. The server must validate a fresh access token whose verified claims report `aal2`; never trust client-supplied role or assurance claims.
4. **Bound challenge:** The challenge endpoint requires an authenticated, active `supreme` profile and AAL2. It binds the challenge row to `auth.uid()` and the current Supabase `session_id`, as well as the challenge hash and expiry.
5. **Native key proof:** The app creates a P-256 signing key in Android Keystore with the fresh challenge in the Android Key Attestation extension. It returns the certificate chain and a domain-separated proof-of-possession signature. The private key never leaves Keystore.
6. **Server verification:** The same-origin proxy forwards the user's access token server-to-server. The Edge Function independently validates the token with Supabase Auth, confirms the active Supreme profile and AAL2, checks the challenge's user/session binding, validates the Android certificate chain and Google revocation metadata, enforces package/signing-certificate/RootOfTrust policy, and verifies proof of possession.
7. **Atomic device session:** Only after all checks pass, one database transaction consumes the challenge and creates a short-lived attested-device session bound to the user ID, Supabase `session_id`, and public-key fingerprint. Store only a hash of the random opaque session token.
8. **HttpOnly cookie:** The Edge Function returns the raw one-time token only to the same-origin Next proxy. The proxy sets a `Secure; HttpOnly; SameSite=Strict; Path=/` cookie with a short expiry. Never return the token in JSON to browser JavaScript or store it in localStorage.
9. **Per-request authorization:** Middleware checks the Supreme role, AAL2, active Supabase session, and the hashed attested-device cookie through a narrowly scoped RPC. Every sensitive server action/API still performs its own server-side authorization.
10. **Logout/revocation:** Logout revokes the device session server-side and clears the cookie. Expired, revoked, mismatched, or stale sessions fail closed.

## Database design requirements

A future CLI-generated migration should:

- Add `user_id` and `auth_session_id` binding to the challenge record.
- Add a private attested-device session table with at least:
  - opaque token hash (unique, never store the raw token),
  - Supreme user ID,
  - Supabase Auth session ID,
  - attested public-key fingerprint,
  - created/expiry/revocation timestamps,
  - last-used timestamp if it can be updated safely.
- Enable RLS and revoke direct `anon`/`authenticated` table access.
- Provide narrowly scoped RPCs for server-only session creation/revocation and an authenticated-user validation function that checks `auth.uid()`, AAL2, current session ID, expiry and revocation.
- Use a transaction so challenge consumption and session creation either both succeed or both roll back.
- Add tests for wrong user, wrong session ID, AAL1, expired/replayed challenge, revoked device, duplicate token hash, privilege boundaries and concurrent consumption.

Do not hand-invent a migration filename. Generate it with `supabase migration new <descriptive_name>`, then test the migration against disposable local PostgreSQL before production review.

## App-only enforcement and threat model

An HttpOnly attestation cookie is a bearer credential. It prevents JavaScript from reading the token, but by itself it is not cryptographic proof on every request. For stronger app-only assurance, retain the attested Keystore private key for the device session and require a short-lived, replay-protected signature for sensitive API operations (method, canonical path, timestamp, nonce and body hash). The server verifies the signature against the public key fingerprint stored at attestation time.

The WebView must continue to allow only the NEWEIX private workspace and the dedicated Supreme auth/MFA/logout routes. It must not become a general-purpose browser. The server remains authoritative; user-agent strings, URL parameters, localStorage flags, and client-supplied role claims are not security controls.

## Remote-first dashboard requirement

Supreme dashboard pages and feature changes should remain server/web delivered through Cloudflare. The Android APK should contain only the stable native shell, app lock, Keystore operations and constrained WebView. Routine dashboard feature changes must not require a new APK. A native bridge or signing-protocol change may require an APK update and must be treated as a separate release.

## Release blockers

- Apply the challenge and consume migrations to production only after review.
- Generate and review the session-binding migration through the Supabase CLI.
- Configure the permanent production APK signing certificate digest; never use the debug signer.
- Add per-challenge verification-attempt limiting before public enablement.
- Measure the verifier under the actual Supabase Edge Runtime.
- Implement and test the native attestation transport and session-cookie handoff on a real Android device.
- Validate the complete password + AAL2 + attestation + logout flow.
- Keep Supreme login disabled until every gate passes.
