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

### 3. Cryptographic ledger integrity is not yet implemented

The current ledger/audit append-only triggers prevent ordinary UPDATE/DELETE operations, but there is no hash chain or independent digital signature. A database-level hash chain can detect accidental or ordinary-role tampering, but a privileged database owner could rewrite the rows and recompute the chain.

Recommended staged design:
1. Add deterministic canonical event serialization and SHA-256 chaining for new audit events, with a transaction-safe sequence/locking strategy.
2. Build a read-only verifier that recomputes the chain and reports the first invalid event.
3. Periodically export a checkpoint containing sequence, event hash and timestamp to an independent Cloudflare Worker/service.
4. Sign checkpoints with Ed25519 using a private key held outside PostgreSQL (managed secret/KMS); never store the signing key in a database table or source code.
5. Retain public verification keys and key-rotation metadata so historical signatures remain verifiable.

**Important:** Do not describe stage 1 alone as cryptographically tamper-proof. External signing and independent checkpoint retention are required for protection against privileged database rewrites.

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
