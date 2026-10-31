# NEWEIX Security Hardening Review

**Review date:** 2026-10-31  
**Scope:** EixPay, Eixon ledger/audit, Supabase Auth and database access controls, Cloudflare Worker application security.  
**Environment:** Review-only against the connected Supabase project and PR branch. No production schema, Auth setting, Cloudflare rule, or Worker deployment was changed.

## Current verified controls

- Supabase PostgreSQL version: 17.11.
- `pgcrypto` 1.3 is installed in the `extensions` schema; `extensions.digest(bytea, text)` is available.
- EixPay migration defines append-only mutation guards for the Eixon ledger and audit events.
- Existing application design uses Supabase Auth, Supreme AAL2 checks, role checks, private-schema storage, explicit function grants, SECURITY DEFINER functions with an empty search_path, row locks and idempotency.
- The PR branch has baseline response headers in `next.config.ts`: HSTS, nosniff, frame denial, strict referrer policy and restrictive Permissions-Policy.
- Latest reviewed PR head `4f88bd190c7989b1b44a30525a015d86528150b1` had successful CI, Storefront PR checks, NEWEIX frontend checks and Cloudflare validation workflow runs. This is validation, not evidence of a production deployment.

## Findings

### 1. Supabase Auth leaked-password protection is disabled

The Supabase Security Advisor reports `auth_leaked_password_protection` as WARN. Enable leaked-password protection in Supabase Auth settings if the project plan supports it (Supabase documentation says Pro plan and above). Also review minimum password length and character requirements. Existing passwords are not automatically changed by enabling the setting.

Reference: https://supabase.com/docs/guides/auth/password-security

**Status:** Requires a Supabase Auth dashboard setting change; not changed by this PR.

### 2. Five RLS-enabled tables have no policies

The Security Advisor reports these tables as RLS-enabled with no policies:

- `private.order_tracking_rate_limits`
- `public.coupons`
- `public.phone_verification_challenges`
- `public.product_submissions`
- `public.shop_settings`

A read-only privilege check confirmed that neither `anon` nor `authenticated` has SELECT privilege on these tables. This is currently deny-by-default, not evidence of public exposure. Do not add broad policies merely to silence the advisor. Review each table's intended server-side access path and add only narrowly scoped policies/grants if direct client access is actually required.

### 3. Cryptographic ledger integrity: stage 1 added to PR, not applied

The PR now contains a database-local SHA-256 hash chain migration for new ledger/audit inserts, but it has not been applied or tested. The current append-only triggers prevent ordinary UPDATE/DELETE operations; the new chain adds tamper evidence for ordinary application roles. There is still no independent digital signature. A database-level hash chain can detect accidental or ordinary-role tampering, but a privileged database owner could rewrite the rows and recompute the chain.

Recommended staged design:
1. Add deterministic canonical event serialization and SHA-256 chaining for new audit events, with a transaction-safe sequence/locking strategy.
2. Build a read-only verifier that recomputes the chain and reports the first invalid event.
3. Periodically export a checkpoint containing sequence, event hash and timestamp to an independent Cloudflare Worker/service.
4. Sign checkpoints with Ed25519 using a private key held outside PostgreSQL (managed secret/KMS); never store the signing key in a database table or source code.
5. Retain public verification keys and key-rotation metadata so historical signatures remain verifiable.

**Important:** Do not describe stage 1 alone as cryptographically tamper-proof. External signing and independent checkpoint retention are required for protection against privileged database rewrites.


### 3A. Stage 1 implemented in PR: SHA-256 integrity chain

Migration added to this PR (not applied to any database):
`supabase/migrations/20261031180000_eixpay_cryptographic_integrity_chain.sql`

- Adds a private integrity event stream for new EixPay ledger and audit inserts.
- Uses `extensions.digest(..., 'sha256')` over PostgreSQL `jsonb::text` serialization, and binds the source table and source ID into each chained event hash.
- Serializes concurrent writes through a locked singleton chain-state row; source insert, chain event and state update share one database transaction.
- Stores only a SHA-256 hash of each source row (not a duplicate copy of financial/audit payloads); the verifier re-hashes the current source row.
- Adds a Supreme AAL2-only `public.eixpay_verify_integrity()` RPC. It checks sequence continuity, previous hashes, event hashes, source-row equality and chain-state consistency.
- The verifier takes a shared lock on chain state during its scan so concurrent inserts cannot create a false partial-snapshot failure.
- Historical ledger/audit records are not backfilled; chain coverage begins with the first insert after the migration is applied.
- The verification response explicitly reports `independent_signature: false`.

**Validation boundary:** Migration is committed to the PR branch only. A read-only check of the connected Supabase production project shows the EixPay ledger and audit tables are not present yet, so this migration cannot be tested there without first applying the earlier EixPay foundation migrations. No SQL integration/concurrency test has been run. The only existing Supabase development branch is named `main` and reports `MIGRATIONS_FAILED`; it is not a valid test target. A separate preview branch is required before SQL testing.

**Remaining stage 2:** External Ed25519 signing and independently retained checkpoints. The private signing key must be provisioned as a Cloudflare Worker secret (or managed KMS key) outside Postgres and source control. The current Worker config has no signing-key binding, and no signing endpoint has been deployed. Do not claim independent signature protection until that service and its verification workflow exist.

### 4. CSP is not yet enabled

The application has baseline security headers, but no Content-Security-Policy. Introduce CSP only after inventorying Next.js inline scripts, Supabase Auth flows, image/media hosts, analytics and any third-party assets. Prefer a nonce-based policy where compatible; begin in report-only mode, inspect violations, then enforce. Do not deploy a guessed restrictive policy that could break sign-in or storefront rendering.

### 5. Rate limiting and Supreme account protection need a dedicated pass

- Inventory sensitive public and authenticated routes (login, OTP/phone verification, password reset, order lookup, review submission, wallet/reward claims, transfer requests and Supreme mutations).
- Apply Cloudflare edge rate limits to abuse-prone routes, with separate thresholds by route and identity/IP; avoid blocking legitimate shared mobile/carrier NAT traffic.
- Ensure Supreme mutations require fresh AAL2 and server-side role checks; add session revocation/re-authentication controls and alerting for privileged actions.
- Review Cloudflare WAF and bot controls before changing production rules.

## Supabase Advisor snapshot

Security Advisor:
- WARN: leaked password protection disabled.
- INFO: five RLS-enabled tables have no policies; the privilege check above found no SELECT grant for `anon` or `authenticated` on those tables.

Performance Advisor:
- Reports 21 unused indexes. These are observations only; no index was removed. Usage counters can be low on a small/new deployment, so validate workload and query plans before any removal.

## Change and deployment boundary

This document records a review and safe implementation plan. It does not apply SQL migrations, alter Supabase Auth settings, change Cloudflare WAF/rate-limit rules, or deploy a Worker. Any database migration must be reviewed and tested on a non-production database branch before production rollout.


## Latest integrity-chain commit validation status

- Integrity-chain migration and documentation are committed to PR #20; latest integrity migration update is `e4e9e280f029efc4a2fb7f7c7917b82352fc0619`.
- GitHub Actions PR workflow query returned no workflow runs for this latest documentation/migration commit.
- GitHub combined status currently reports a failing `Vercel` status with target URL indicating a build-rate-limit/plan restriction. This is not a successful Cloudflare build and must not be reported as one.
- No migration execution, SQL integration test, concurrency test, TypeScript build, or Worker preview has been completed for the new integrity-chain change.
- Required next validation: run the migration on an isolated Supabase preview branch, exercise concurrent inserts and tampering/rollback cases, then run the repository's typecheck/lint/build and Cloudflare OpenNext preview. Production rollout remains blocked pending review and explicit authorization.


## Preview database cost gate

Creating a dedicated Supabase preview branch requires additional compute. Supabase quoted **$0.01344 per hour** (approximately **$9.81 per 30.4-day month** while running). No branch was created because explicit approval for this recurring cost is required. The existing preview branch is in `MIGRATIONS_FAILED` state and must not be used for validation.
