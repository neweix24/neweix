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

## Required design before implementation

### Route concealment
- Remove Supreme links and route hints from public storefront UI, public metadata, sitemap, and other public discovery surfaces.
- Evaluate a configurable, high-entropy private entry path or a separate private hostname only as a discovery-reduction measure.
- Do not hardcode a secret route in the public repository or treat an unguessable path as authentication.
- Keep canonical internal route handling and every redirect consistent, including MFA completion and app deep links.

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

1. Complete the Supreme page/API authorization inventory.
2. Remove public discovery references without changing the storefront.
3. Implement a private entry mechanism with a non-secret server-side authorization boundary.
4. Add automated tests for anonymous, customer, staff, admin, Supreme without MFA, and Supreme with AAL2 access.
5. Build the Android app shell and integrate authentication.
6. Run typecheck, lint, tests, Cloudflare OpenNext preview, and authenticated/unauthenticated smoke tests.
7. Produce a signed APK and installation/recovery instructions.

## Not done yet

- No production route was renamed or blocked.
- No Cloudflare DNS, Access, WAF, Worker, or environment setting was changed.
- No Supabase schema, policy, credential, or user account was changed.
- No APK has been built.
- The full Supreme API inventory and endpoint-by-endpoint authorization audit remain the next implementation task.
