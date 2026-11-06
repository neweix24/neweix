# Supreme Android Attestation Verifier Runtime Decision

Status: **proposed architecture; no runtime deployed; app-only login remains disabled**

## Decision

Use the maintained `android/keyattestation` Kotlin verifier in a separate trusted JVM service. Do not reimplement X.509 path validation, Android Keymaster/KeyMint ASN.1 parsing, Remote Key Provisioning rules, or Google's certificate-validity exceptions in the Supabase Deno runtime.

The verifier must run outside the Android device being attested. It must be reached only through a server-to-server authenticated channel from the NEWEIX backend. It must not be directly exposed as a public unauthenticated endpoint.

## Why a separate JVM runtime

The maintained verifier is a Kotlin/JVM library. It validates Google-rooted trust paths, revocation, the attestation extension and challenge, and can enforce the expected attestation application ID. Its result includes the verified public key, security level, verified boot state and device information.

The Supabase Edge Function runtime is Deno/JavaScript, not a JVM runtime. The existing Deno proof-of-possession helper is only a cryptographic sub-step after certificate trust and attestation-policy validation; it is not a substitute for the Kotlin verifier.

## Cloudflare deployment option and cost gate

Cloudflare Containers can host a Linux/JVM verifier image behind a Worker, but Cloudflare's current product documentation states that Containers are available on Workers Paid plans. This repository's current Worker deployment does not prove that the account has Containers entitlement or that the user has approved the associated paid plan and usage.

Therefore:
- Do not add a Containers binding to the production `wrangler.jsonc`.
- Do not deploy a container or change the Cloudflare plan automatically.
- Do not route Supreme authentication to a verifier URL that has not been deployed and tested.
- First build and test the verifier image in CI only. Deployment requires explicit approval of the hosting plan and budget, or confirmation of an already available trusted JVM host.

A GitHub Actions runner can build and test the verifier but is not a production verification service and must never be used as one.

## Required service contract

The private verifier endpoint accepts a bounded request containing:
- challenge UUID and raw 32-byte challenge;
- the ordered DER certificate chain (base64 encoded);
- the Android app's proof-of-possession signature;
- a server-generated request correlation ID.

It must:
1. Authenticate the calling NEWEIX backend with a dedicated server-to-server credential or mutually authenticated channel. Never accept a credential embedded in the APK.
2. Enforce strict request body, certificate count, per-certificate size, total chain size, timeout and rate limits.
3. Load Google's current attestation trust anchors and fresh revocation status; fail closed if either is unavailable, malformed or stale.
4. Invoke the maintained Kotlin verifier using the expected Android application ID and production signing-certificate digest.
5. Require a successful chain result, exact challenge match, hardware-backed security level (`TrustedEnvironment` or `StrongBox`), locked device and `Verified` boot state.
6. Require the expected package name and production signing-certificate digest. Never accept debug signing certificates. Reject when the production digest is not configured.
7. Verify proof of possession with the public key returned by the trusted verifier, not a key parsed from an untrusted certificate.
8. Return only a narrow typed decision and the verified public key material needed by the caller. Do not return raw certificate details or device identifiers to clients; avoid logging certificate contents.
9. Let the NEWEIX backend atomically consume the challenge only after every cryptographic and policy check succeeds. Challenge consumption is one-time and does not itself create a Supabase session.

## Authentication boundary

Attestation is one gate, not a login method. Final Supreme authentication still requires:
- the existing Supreme account and role check;
- password/session authentication;
- Supabase MFA with AAL2;
- successful app attestation bound to the same fresh challenge and request;
- server-side authorization on every privileged request.

A browser, ordinary WebView, or shared login page must not be accepted as Supreme app proof. Admin, Manager, Employee and Staff authentication must remain unchanged.

## Release gates

- [ ] Select and approve a trusted JVM hosting runtime and budget, or confirm an existing eligible host.
- [ ] Pin an audited upstream `android/keyattestation` release/commit and record its Apache-2.0 license.
- [ ] Build the service with a minimal, non-root container image and a read-only filesystem where practical.
- [ ] Add unit and integration tests using upstream valid/invalid fixtures, including current Google root rotation and RKP chains.
- [ ] Establish the production APK signing key and configure its SHA-256 certificate digest as a server-side secret.
- [ ] Prove fail-closed behavior for missing secrets, stale revocation data, invalid chain, challenge mismatch, app-ID mismatch, software security level, unlocked/unverified boot, revoked serial, replay and verifier outage.
- [ ] Deploy to a private staging endpoint; test server-to-server authentication and network restrictions.
- [ ] Only then integrate with the Supreme authentication flow and verify web Supreme login is rejected while all employee roles continue to work.

Until every gate passes, the app-only Supreme login feature stays disabled and this PR must not be merged as a completed verifier.
