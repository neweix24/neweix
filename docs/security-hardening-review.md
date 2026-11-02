# NEWEIX Security and Integration Review

**Updated:** 2026-11-03  
**Repository:** neweix24/neweix, branch main  
**Hosting:** Cloudflare Workers via OpenNext  
**Database:** Connected Supabase project

This document replaces older review notes that referred to EixPay/social foundations as unapplied or treated the site as a Vercel deployment. It distinguishes deployed database state, repository code, CI checks and external-provider tests.

## Changes applied to the connected database and repository

### 1. Customer phone verification bypass closed

- Removed INSERT and UPDATE privileges for the authenticated role on public.customer_profiles.
- Restored only the intended safe profile-field update permissions.
- The customer Data API can no longer set phone or phone_verified_at directly.
- Server-controlled OTP verification remains responsible for marking a phone as verified.
- Added a regression test for the sensitive column grants.

### 2. OTP abuse controls made atomic

- Added public.reserve_phone_verification_challenge.
- It serializes requests by user and phone using transaction-scoped advisory locks.
- Enforces 60-second resend cooldown, five reservations per user per 24 hours and ten per phone per 24 hours.
- Only service_role can execute the reservation RPC.
- Added a regression test for the function's grants.

### 3. Authentication refresh contention reduced

- Server-side staff/customer authorization paths use verified JWT claims instead of repeatedly calling auth.getUser().
- MFA setup uses the existing browser session instead of extra user lookups.
- This reduces competing refresh-token rotations between middleware, Server Components and API handlers.

**Not yet confirmed:** a real user must complete password + MFA login after deployment. Build success alone is not proof that the reported redirect-to-login problem is fixed.

### 4. Checkout and order lifecycle

- COD orders with zero delivery fee no longer require an MFS transaction ID.
- If a COD delivery fee is due, the delivery-fee payment still requires MFS details and verification.
- Returned orders now support item-level partial restocking after staff inspect the physical quantities. A per-line idempotency ledger, order/product row locks and audit-log entries prevent double restocking and preserve who approved each quantity.

### 5. Pathao Courier

- Added service-role-only atomic reservation for a Pathao shipment, with Admin/Supreme role checks in the API and Supreme AAL2 enforcement.
- Added consignment creation using the Merchant Store ID, order number, recipient details, item quantity/weight and COD collection amount.
- Added tracking lookup and synchronization of recognized delivery states to the order record.
- Timeout outcomes remain in a booking/in-progress state and require a manual check in the Pathao Merchant Panel before retrying, to reduce duplicate consignments.

**Live test still required:** valid production credentials, a valid Merchant Store ID, a confirmed test order and a real Pathao booking/tracking response. No real parcel has been booked as part of this code review.

### 6. BulkSMSBD transactional notifications

- Phone OTP continues to use BulkSMSBD.
- Added a private, RLS-protected notification outbox for order-created, payment-confirmed and order-status messages.
- A database trigger queues notifications; the Cloudflare Worker processes them every five minutes.
- Versioned lease-token RPCs fence claims/completion/retries; legacy queue RPC signatures are inert during rolling deployment. Failed sends are retried with backoff up to five attempts.
- Delivery remains at-least-once if BulkSMSBD accepts a message but the response is lost; provider-side idempotency is required for exactly-once delivery.

**Live test still required:** confirm provider balance, sender ID approval, source-IP allowlisting and successful delivery to a controlled test number. Marketing/bulk promotional campaigns are not enabled; those require customer consent and compliance review.

### 7. YouTube scheduled publishing

- Added scheduled publishing queue processing in the Cloudflare Worker.
- YouTube OAuth uses upload/read-only scopes; refresh tokens remain encrypted at rest.
- Scheduled publishing accepts exactly one public HTTPS video URL, enforces video MIME type and a 50 MB upload ceiling, and publishes the video as Public.
- Failed uploads are recorded against the delivery and post.
- Facebook, Instagram and TikTok remain Draft-only because provider-specific app permissions and publishing integrations are not complete.

**Live test still required:** connect the YouTube channel through /admin/social-media, schedule a controlled video and verify upload/visibility. The user must complete Google's OAuth consent; the assistant cannot grant that consent.

### 8. Deployment and security headers

- Cloudflare production deployment is gated on both the matching GitHub CI run and disposable PostgreSQL migration/regression test succeeding; it checks out the exact tested commit.
- Added a Content-Security-Policy header, including the Cloudflare Turnstile, Google OAuth and YouTube frame hosts.
- Removed `unsafe-eval` and the generic HTTPS script wildcard; the policy still permits inline scripts/styles and broad HTTPS image/style resources. It is a hardened baseline, not a final nonce-based strict CSP. Further tightening requires a compatibility pass against the live storefront and auth flows.
- wrangler.jsonc lists required server-only integration secrets; `PATHAO_WEBHOOK_SECRET` is intentionally not a deployment blocker while it is absent, so the Pathao webhook fails closed with HTTP 503 until the merchant-configured value is added. .env.example documents the secret name without its value.
- The production Worker was deployed from main commit `d574e2850300f19f9f7474173ca80487d4552134`; Cloudflare reports Worker version 371 at 100% traffic. Query-string redaction is enabled and the daily `17 2 * * *` EixPay watchdog trigger is present.

## Verified security foundations

- Sensitive service-role operations remain server-side.
- The live Production audit confirmed that the 19 tables flagged as RLS-enabled-without-policies have no direct SELECT/INSERT/UPDATE grants for anon or authenticated; the no-policy design is intentional for those private/server-only tables.
- The live Production audit found 29 authenticated SECURITY DEFINER RPCs. All inspected authenticated RPCs check `auth.uid()`; Supreme-only operations also check staff role and AAL2. The single anon-executable review-list RPC returns approved public reviews only.
- Six workforce/department foreign-key indexes and two return-restock indexes are applied. Performance Advisor no longer reports unindexed foreign keys for the introduced restock ledger.
- 52 indexes are reported unused by current advisor statistics. They are not dropped because usage counters may have reset and the indexes support existing query paths.
- Customer device/IP records are audit signals; they are not used to block users by country or VPN.


## Live Production audit notes (2026-11-02)

- Connected Supabase project is healthy on PostgreSQL 17.11.0.003.
- Eleven production migrations for queue fencing, atomic embedding writes, partial-return stock restoration, EixPay watchdog, search gate and supporting indexes were applied successfully, followed by two SQL hotfix migrations for ambiguous PL/pgSQL column references. The disposable PostgreSQL migration/regression suite also passed on the merged main commit.
- The live `audit_logs` table uses `actor_id`; new restock audit writes must target that column (not the older `actor_user_id` name found in historical source schema files).
- At the initial queue audit, the SMS outbox contained one failed job and no queued/sending jobs; the search embedding queue had no rows. Production smoke tests later executed both v2 claim RPCs successfully with no rows claimed. This is a point-in-time observation, not a permanent guarantee.
- The EixPay watchdog returned `valid: true`, `checked_events: 0`, `independent_signature: false`; the current chain contains no events, so this validates the empty-chain state only.
- Supabase Security Advisor reports leaked-password protection disabled. This is an Auth dashboard setting, not a repository migration; an authorized project administrator must enable it under Authentication security/password settings.

## Remaining issues and external dependencies

1. **Supabase leaked-password protection:** Security Advisor still reports this setting disabled. It must be enabled in Supabase Auth settings by an authorized project administrator if available on the current plan. It cannot safely be changed through repository code.
2. **Pathao webhook secret:** `PATHAO_WEBHOOK_SECRET` is not present in the production Worker. The endpoint currently returns HTTP 503 until the exact inbound signature secret configured in Pathao Developer API > Webhook Integration is added as a Cloudflare Worker secret. Do not guess or reuse the Pathao API client secret.
2. **Legacy migration history:** older repository filenames and production migration versions diverge. The duplicate 20261031180000 prefix has been resolved by renaming the social migration to 20261031180100, but the older history still needs a deliberate baseline/version mapping. Do not run supabase db push blindly.
3. **CI and deployment:** merged main commit `04da09c5e19a9061cd810351eadf79c9b084ad84` passed CI and disposable migration tests; the subsequent deployment-configuration commit `d574e2850300f19f9f7474173ca80487d4552134` passed CI/migration tests and deployed Worker version 371. The earlier deployment attempt failed because the Pathao webhook secret was absent; the deployment guard was then adjusted so the rest of the site could deploy while that webhook stays fail-closed.
4. **End-to-end tests:** automated browser coverage is still needed for login/MFA, phone OTP, checkout, payment verification, order cancellation/return, product permissions, Pathao and YouTube publishing.
5. **NPM dependencies:** CI install reported 18 moderate audit findings. Review the lockfile/dependency advisories and apply compatible updates; do not use npm audit fix --force without checking breaking changes.
6. **CSP hardening:** remove unsafe-eval/inline allowances only after replacing any required inline scripts with nonces or hashes and verifying Turnstile, Supabase Auth, Google OAuth and storefront rendering.
7. **Social provider approvals:** Facebook, Instagram and TikTok automated publishing require their own provider apps, permissions and approval.
8. **EixPay legal review:** wallet display is enabled, but earning, redemption and transfers remain disabled. Do not enable them until legal review and policy confirmations are complete.

## EixPay and cryptographic boundary

- Eixon is an internal reward unit, not a blockchain token or real-money cryptocurrency.
- The SHA-256 integrity chain provides database-local tamper evidence for covered events.
- A service-role-only watchdog verifies the complete chain daily from the Cloudflare Worker Cron Trigger and records verification results in a private history table (retained for 400 days).
- A daily verification failure is emitted as a high-severity Worker log; it does not automatically freeze wallet operations.
- It is not end-to-end encryption and is not independently tamper-proof against a privileged database owner.
- Independent Ed25519 signing/checkpoint storage outside PostgreSQL has not been implemented; the watchdog reports `independent_signature: false`.
- Earning, redemption and transfer flags remain disabled pending legal review.

## Validation policy

Record these independently:
- GitHub commit SHA.
- CI TypeScript/ESLint/build results.
- Disposable PostgreSQL migration/regression test result.
- Cloudflare deployment result and deployed SHA.
- Supabase live schema/permission checks.
- Real provider and browser end-to-end tests.

A green build or successful Worker deployment must never be presented as proof that OTP, login, SMS, Pathao, payments or social publishing work end-to-end.
