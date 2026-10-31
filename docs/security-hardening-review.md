# NEWEIX Security and Integration Review

**Updated:** 2026-10-31  
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
- Returned orders now have a manual, audited restock action. Stock is restored only after staff inspect the returned items; row locking and stock_restored_at prevent duplicate restoration.

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
- Failed sends are retried with backoff up to five attempts. The private outbox and claim/complete/fail RPCs are service-role-only.

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
- CSP currently permits broad HTTPS resources and inline/eval script compatibility. It is a baseline policy, not a final nonce-based strict CSP. Tightening requires a report/compatibility pass against the live storefront and auth flows.
- wrangler.jsonc now lists the required server-only integration secrets; .env.example documents their names without values.

## Verified security foundations

- Supabase Performance Advisor's unindexed foreign-key findings were cleared by adding indexes for the newly introduced order and social-media foreign keys.

- The last schema audit found RLS enabled on all 45 public/private tables checked (45 enabled, 0 disabled).
- Sensitive service-role operations remain server-side.
- Private EixPay and notification tables are not directly readable by anon or authenticated.
- Supreme-only operations use server-side role checks and AAL2 checks.
- Customer device/IP records are audit signals; they are not used to block users by country or VPN.

## Remaining issues and external dependencies

1. **Supabase leaked-password protection:** Security Advisor reported this setting disabled. It must be enabled in Supabase Auth settings by an authorized project administrator if available on the current plan. It cannot safely be changed through repository code.
2. **Legacy migration history:** older repository filenames and production migration versions diverge. The duplicate 20261031180000 prefix has been resolved by renaming the social migration to 20261031180100, but the older history still needs a deliberate baseline/version mapping. Do not run supabase db push blindly.
3. **CI and deployment:** latest checks must finish successfully before claiming a deployment. Any cancelled intermediate workflow is not a validation result.
4. **End-to-end tests:** automated browser coverage is still needed for login/MFA, phone OTP, checkout, payment verification, order cancellation/return, product permissions, Pathao and YouTube publishing.
5. **NPM dependencies:** CI install reported 18 moderate audit findings. Review the lockfile/dependency advisories and apply compatible updates; do not use npm audit fix --force without checking breaking changes.
6. **CSP hardening:** remove unsafe-eval/inline allowances only after replacing any required inline scripts with nonces or hashes and verifying Turnstile, Supabase Auth, Google OAuth and storefront rendering.
7. **Social provider approvals:** Facebook, Instagram and TikTok automated publishing require their own provider apps, permissions and approval.
8. **EixPay legal review:** wallet display is enabled, but earning, redemption and transfers remain disabled. Do not enable them until legal review and policy confirmations are complete.

## EixPay and cryptographic boundary

- Eixon is an internal reward unit, not a blockchain token or real-money cryptocurrency.
- The SHA-256 integrity chain provides database-local tamper evidence for covered events.
- It is not end-to-end encryption and is not independently tamper-proof against a privileged database owner.
- Independent Ed25519 signing/checkpoint storage outside PostgreSQL has not been implemented.
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
