# Supreme Android Attestation Verifier — Design and Rollout

Status: design baseline for implementation on `feat/supreme-server-attestation-verifier`.
This document does **not** enable or claim app-only Supreme authentication.

## Security objective

Only the signed NEWEIX Supreme Android application, running on a device that produces acceptable hardware-backed Android Key Attestation, may proceed to Supreme authentication. The existing Supreme role check and Supabase AAL2 MFA remain mandatory. Admin, Manager, Employee and Staff authentication must remain unchanged.

A private URL, WebView User-Agent, package name supplied by the client, static APK secret, or custom HTTP header is not proof of app identity.

## Runtime decision

Keep the public storefront and Cloudflare Worker as the application edge. Evaluate a dedicated Supabase Edge Function (Deno) for certificate verification so the verifier can use pinned npm packages without adding certificate-parsing dependencies to the Next.js/Cloudflare bundle.

Candidate components:
- `pkijs` + its single shared `asn1js` dependency for X.509 parsing and RFC 5280 certificate-path validation.
- `@peculiar/asn1-android` + `@peculiar/asn1-schema` for Android Keymaster/KeyMint attestation extension schemas, including non-standard field ordering.
- Google’s published root set and revoked-serial status endpoint as live trust data.

This is a JavaScript/Deno implementation, not Google's maintained Kotlin verifier. It must be treated as a security-sensitive port and must pass the acceptance tests below before it can gate login. If it cannot match the official verifier on the supplied fixture corpus, stop and use the maintained Kotlin verifier in a separately trusted runtime rather than weakening checks.

## Required verification protocol

1. **Server-only invocation**
   - The verifier is called only by a trusted server route using a server credential.
   - Never expose the Supabase service-role key to the Android app or browser.
   - Apply request-size, certificate-count, per-IP and per-challenge limits.

2. **Challenge binding**
   - Accept a challenge ID, the raw 32-byte challenge returned by the challenge endpoint, the certificate chain, and a signature made by the newly generated Android Keystore private key.
   - Recompute SHA-256(raw challenge) and match the stored hash.
   - Locate the first trusted key-attestation extension according to Android's chain rules and verify it contains the exact raw challenge. Do not assume the extension is always on the leaf certificate.
   - Verify the leaf public key validates the signature over the exact UTF-8 payload `NEWEIX-SUPREME-ATTESTATION-V1\\n<challenge UUID>\\n<base64url challenge without padding>` using `SHA256withECDSA`. The signature is standard ASN.1 DER ECDSA.
   - The Deno shared module `supabase/functions/_shared/supreme-attestation-proof.ts` strictly decodes the 32-byte challenge and canonical UUID, builds this domain-separated payload, converts Android's DER ECDSA signature to WebCrypto's fixed-width P-1363 representation, and verifies proof-of-possession. It is deliberately downstream of certificate-chain and attestation-policy validation; it does not establish certificate trust.
   - Reject expired, unknown, already-consumed, malformed, or mismatched challenges.

3. **Certificate path and revocation**
   - The shared Deno module `supreme-google-attestation-metadata.ts` now fetches Google's published root and status JSON over HTTPS with redirect rejection, timeouts, bounded streaming response reads, content-type checks, cache-freshness parsing, and strict schema validation. It rejects both `REVOKED` and `SUSPENDED` serials. This metadata loader is not itself an X.509 path validator.
   - Parse every DER certificate with strict size/count limits.
   - Validate signatures, issuer/subject path, certificate validity windows, CA constraints, and path to one of Google's currently published trust anchors.
   - Reject a chain if any certificate serial is listed as revoked by Google's current status feed.
   - Fetch trust data over HTTPS. If either source is unavailable, malformed, stale beyond the chosen freshness window, or cannot be parsed, fail closed. Never silently fall back to a hard-coded stale root list or skip revocation.
   - Do not assume a fixed chain length or fixed RSA-only root: Remote Key Provisioning changes chain structure and algorithms.

4. **Android attestation extension**
   - Parse the ordered X.509 chain and locate the first key-attestation extension encountered when walking from the trust-anchor side toward the leaf. Do not blindly read the leaf: Android's current guidance says the extension may be on a non-leaf certificate.
   - If a provisioning-information extension is present, enforce Android's required relationship between that certificate and the immediately subsequent key-attestation certificate; parse and validate the provisioning extension rather than ignoring it. Pin the exact provisioning-extension OID and schema from the current AOSP specification during implementation; do not guess it.
   - Reject chains with no trusted key-attestation extension, malformed or duplicate/untrusted later extensions, or an extension in a position inconsistent with the provisioning-information rules.
   - Require key-attestation extension OID `1.3.6.1.4.1.11129.2.1.17` on the selected certificate.
   - Support legacy Keymaster and current KeyMint structures, including non-strict authorization-list ordering.
   - Require both attestation and key security levels to be TrustedEnvironment or StrongBox.
   - Require EC P-256, SHA-256 digest, generated key origin, and SIGN + VERIFY purposes in the hardware-enforced authorization list.
   - Require hardware-enforced RootOfTrust with `deviceLocked = true` and `verifiedBootState = VERIFIED`.
   - Require AttestationApplicationId package `com.neweix.supreme` and the expected production APK signing-certificate SHA-256 digest.

5. **One-time consumption**
   - Do not consume a challenge before the cryptographic and policy checks finish.
   - After all checks succeed, atomically set `consumed_at` only where ID and challenge hash match, `consumed_at IS NULL`, and expiry is still in the future.
   - Require exactly one updated row. Concurrent replays must have at most one winner.

6. **Authentication boundary**
   - Attestation verification alone does not create a Supabase session or grant a role.
   - A later integration must require a fresh proof-of-possession for the registered key before the Supreme password/MFA flow can complete.
   - The web/shared login route must reject Supreme-role continuation even when a private `next` path is supplied; Admin/Manager/Employee/Staff routes remain as they are.
   - No unverified fallback is permitted.

## Production configuration prerequisite

The production APK signing certificate digest is not yet established in this repository. The current preview APK is debug-signed and must not be treated as the production signer.

Before enforcement:
- Create or select the production Android signing key using a secure local process.
- Obtain the SHA-256 digest of the public signing certificate.
- Store only that digest as a server-side secret/config value (for example `SUPREME_ANDROID_SIGNING_CERT_SHA256`).
- Never commit the signing keystore, private key, passwords, or signing material.
- Ensure CI can build a debug APK for validation while production verification still rejects it unless the expected production digest is configured.

## Acceptance test matrix

The verifier must have automated positive and negative fixtures for:
- valid TEE and valid StrongBox chains;
- both currently trusted Google roots, including the root introduced for 2026;
- valid Remote Key Provisioning chains with variable intermediate count, provisioning-information extension present/absent, and key-attestation extension on a non-leaf certificate;
- reject a chain where the key-attestation extension is only on an untrusted later certificate or violates the provisioning-information adjacency rule;
- invalid signature, wrong issuer, untrusted root, expired leaf/intermediate/root;
- every chain certificate revoked, status-feed unavailable, malformed, or stale;
- absent/malformed attestation extension and unsupported extension encoding;
- challenge mismatch, expired challenge, consumed challenge, and concurrent replay;
- wrong package, wrong signing digest, wrong key algorithm/curve/size/digest/purpose/origin;
- software-only security level, unlocked bootloader, non-Verified boot state, and missing hardware RootOfTrust;
- oversized request, too many certificates, invalid Base64/Base64URL, and rate-limit exhaustion.

Run the same valid and invalid certificate fixtures through the maintained Android verifier and the Deno implementation; compare decisions. Any disagreement is a release blocker.

## Rollout gates

- Gate A: verifier library and fixture tests pass; endpoint still grants no authentication.
- Gate B: server-side device-key registration and proof-of-possession protocol reviewed and tested.
- Gate C: production signing-certificate digest configured and verified against a production-signed APK.
- Gate D: Supreme web login is denied; only the Android app flow can obtain a Supreme session after attestation + password + AAL2 MFA.
- Admin/Manager/Employee/Staff login regression tests pass at every gate.

Until Gate D is deployed and verified, app-only Supreme login is **not enabled**.
