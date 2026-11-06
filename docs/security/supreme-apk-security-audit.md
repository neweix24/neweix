# NEWEIX Supreme APK and route-security audit

**Status:** Phase 1 audit; no production settings or runtime routes changed.
**Repository baseline:** `main` at audit time. Follow-on work is based on `feat/neweix-supreme-dashboard-phase-1` so it can be stacked after the current Supreme navigation and dashboard work.

## User requirement

- Keep the customer storefront and its public URL working normally.
- Provide a separate Android APK as the owner's Supreme control center.
- Do not advertise or expose the Supreme dashboard URL in public-facing navigation, metadata, sitemap, or search results.
- Preserve server-side authorization; hiding a route is not a substitute for access control.

## Verified current controls

1. `app/supreme/page.tsx` calls `requireStaff(["supreme"])`.
2. `app/supreme/layout.tsx` also calls `requireStaff(["supreme"])`.
3. `lib/auth.ts` validates the signed Supabase claims, active staff profile, Supreme role, and AAL2 assurance.
4. `middleware.ts` recognizes `/supreme`, checks the active staff role, requires role `supreme`, and enforces a verified TOTP factor plus AAL2.
5. `app/sitemap.ts` currently lists only storefront routes; it does not include `/supreme`.
6. `app/robots.ts` disallows crawling `/supreme/`, `/admin/`, `/staff/`, and `/api/`.

## Exposure observations

- `robots.txt` is a crawler instruction, not an access-control mechanism. A disallowed path can still be requested directly.
- The current internal route name `/supreme` is present in the public source repository, Supreme layout links, PWA manifest, service-worker registration, and authentication redirect flows. Therefore the route name cannot be considered secret.
- The existing PWA manifest uses `/supreme` as its id, start URL, and scope. The service worker is deliberately limited to that scope and does not cache authenticated content.
- A separate APK cannot make the website origin, API paths, or network requests cryptographically invisible. A determined user can inspect application traffic. Do not place service-role keys, database credentials, or privileged secrets in the APK.
- The public storefront must remain available; any access restrictions must target Supreme-only pages and Supreme-only APIs, not the whole domain.

## Implemented private-entry design

### Route concealment
- A configurable private entry path is now implemented in `middleware.ts` using the server-only `SUPREME_PRIVATE_PATH` Cloudflare secret.
- The configured path must be one segment beginning with `/` and followed by 32–96 alphanumeric, underscore, or hyphen characters. Example format only: `/control-<random-hex>`.
- Requests to the configured private path are authenticated as Supreme + AAL2, then internally rewritten to the existing `/supreme` route. The browser remains on the private path.
- Existing in-workspace links to internal `/supreme/**` paths are redirected back to the private alias only when the same-origin Referer is already within the private workspace; direct/external requests receive 404.
- Login, MFA challenge, and MFA setup preserve the private destination through the full authentication round trip. Private responses carry `no-store` and `X-Robots-Tag: noindex` headers.
- Direct requests to `/supreme/**` return 404 once the private path is configured. A malformed configured value fails closed with 503 on the legacy route.
- The Supreme PWA manifest and service-worker scope now use the configured private path; the service worker script itself contains no private path.
- `wrangler.jsonc` now declares `SUPREME_PRIVATE_PATH` as a required Cloudflare secret. It is deliberately not stored in Git.
- Do not treat an unguessable path as authentication. Server-side role + AAL2 checks remain mandatory.
- Keep MFA redirects and app deep links pointed at the private path; test the full login/MFA return path before production deployment.

### Cloudflare configuration required before deployment
1. Generate a private value locally, for example: `printf '/control-%s\n' "$(openssl rand -hex 24)"`.
2. From the repository root, run `npx wrangler secret put SUPREME_PRIVATE_PATH` and paste the generated value including the leading slash.
3. Do not send the value in chat, commit it, put it in `wrangler.jsonc`, or place it in a `NEXT_PUBLIC_*` variable.
4. Configure the same secret for the production Worker and any preview Worker used for verification.
5. Only deploy after the preview verifies: private path + Supreme AAL2 succeeds; unauthenticated, customer, staff, and admin sessions are denied; direct `/supreme` returns 404; storefront and customer routes continue working.
6. Save the private entry path in a password manager. If lost, rotate the Cloudflare secret and redeploy.

### Authorization
- Retain server-side Supreme role checks and AAL2 on every protected page.
- Audit every `/api/supreme/**` handler and every Admin API called by the Supreme workspace. Each mutation must independently verify the authenticated user, active Supreme role, and required MFA assurance; page middleware alone is insufficient API authorization.
- Return non-cacheable responses for authenticated Supreme pages and APIs.
- Keep customer and storefront routes unchanged.

### APK
- Use a dedicated Android application ID and signing key; never embed Supabase service-role credentials.
- Use Supabase user authentication and MFA, with secure session storage and explicit logout/revocation.
- Consider device enrollment and Android app/device attestation as a later hardening layer. Do not claim APK-only access until server-verifiable device identity is implemented and tested.
- Build the APK only after the mobile control UI, auth lifecycle, deep links, API authorization, and release signing are verified.

## Implementation sequence

1. **Completed in this branch:** review Supreme page and API authorization, add configurable private entry middleware, preserve login/MFA redirects, and add smoke-test coverage.
2. **Pending:** configure the Cloudflare secret and verify the route behavior in a Cloudflare preview.
3. **Pending:** run typecheck, lint, OpenNext build, and endpoint-level authorization tests.
4. **Next phase:** build the Android app shell and integrate secure Supabase authentication.
5. **Release:** test on Android, configure signing, and produce a signed APK with installation/recovery instructions.

## Supreme API review

All seven current `app/api/supreme/**/route.ts` handlers independently verify the authenticated user, active Supreme staff profile, and AAL2 before privileged reads or mutations. Sensitive responses use `private, no-store`; the staff-provisioning route was updated in this branch to apply the same cache policy to every success and error response. The EixVerse campaign endpoint accepts structured payloads and delegates business validation to its database RPC; its DB function and privilege tests remain part of the deeper migration review.

## Not done yet

- The private entry code is committed to this branch but is not active in production until the Cloudflare secret is configured and the PR stack is merged/deployed.
- No production route, DNS, Cloudflare Access/WAF rule, Worker setting, or secret was changed.
- No Supabase schema, policy, credential, or user account was changed.
- Typecheck, lint, OpenNext build, and live authenticated/unauthenticated route tests have not run yet.
- No APK has been built or released.
- Device attestation and device enrollment remain future hardening work.
