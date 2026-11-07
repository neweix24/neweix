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


## Zero-cost hosting constraint (2026-11-07)

The project owner has explicitly set a zero-budget constraint. Do not enable Workers Paid, Cloudflare Containers, paid VPS/JVM hosting, paid certificate-verification APIs, or any service that requires a paid upgrade. Do not assume a nominal free tier is safe if it requires a billing method or can incur overage charges.

The maintained Kotlin/JVM verifier remains the reference implementation for expected security decisions, but no production JVM runtime is approved or assumed to exist. GitHub Actions runners are CI-only and must never process live authentication requests.

The only candidate that may avoid a new hosting bill is a Deno-native verifier in the existing Supabase Edge Function environment. This is a security-sensitive port, not a shortcut: pin audited dependencies; validate X.509 paths, Android Keymaster/KeyMint extensions, Remote Key Provisioning and Google revocation correctly; and compare decisions against the maintained Kotlin verifier using upstream fixtures. If parity cannot be demonstrated, do not enable app-only login. Keep the current Supreme authentication protections and do not weaken them to fit the budget.

No production signing certificate digest is configured yet. The debug APK remains untrusted for production attestation.

## Pinned reference verifier used by CI

The reference source is Google's public `android/keyattestation` repository at immutable commit `0e3ac2fdd54799d779e1979a96fbcba0361b2089` (observed upstream commit date: 2026-10-30). The repository README identifies the library as a Kotlin verifier for Android key-attestation chains and documents server-side verification, Google trust anchors, revocation status, challenge checking, and additional checks for verified boot and device lock.

The upstream commit reports an **unsigned** Git commit signature status. The SHA pin makes CI source selection reproducible; it does not independently authenticate the publisher or replace source review. Review the pinned source and license before treating it as a trusted dependency. Do not silently update the pin to a moving branch.

The `.github/workflows/supreme-keyattestation-reference.yml` workflow checks out exactly this commit, asserts the checked-out SHA, and runs its Gradle test suite on a Java 21 GitHub-hosted runner. This is a CI reference test only: the runner is not a live verifier and no production authentication traffic is sent to it. The workflow requires no deployment secret and provisions no hosting service.

## Deno-native X.509 capability assessment (2026-11-07)

A runtime/API review was performed before selecting any Deno implementation:

- Deno exposes Node-compatible `node:crypto` `X509Certificate` helpers, including parsing/inspection and certificate signature verification. The `verify(publicKey)` operation only checks whether a certificate was signed by a given public key; it does not perform full certificate-path validation, Android attestation-extension policy, RKP chain-role checks, or Google revocation policy.
- WebCrypto supplies cryptographic primitives but does not provide a complete Android Key Attestation path verifier.
- PKIjs provides generic RFC 5280 certificate-chain validation and CRL/OCSP support. That is useful PKI functionality, but it is not evidence of compatibility with Android's legacy non-RFC-5280 chains or the custom chain semantics implemented by the pinned Kotlin reference.
- `@peculiar/x509` provides X.509 parsing and chain/bundle helpers, but its published feature description likewise does not establish parity with the Android-specific validator.

**Decision:** do not treat any of these APIs/libraries as a drop-in replacement for `android/keyattestation`. A Deno feasibility spike may use one of them for bounded ASN.1/X.509 parsing, but must not return an attestation acceptance decision until Android-specific path validation and extension semantics have been independently implemented and differentially tested against the pinned Kotlin oracle. Generic `X509Certificate.verify()` or a stock RFC 5280 chain engine alone is insufficient.

No new runtime dependency was added in this assessment. Avoiding an unreviewed dependency is preferable to adding a parser that creates a false impression of security completeness.


## Deno X.509 feasibility spike (2026-11-07)

A first bounded structural X.509 parser has been added at
`supabase/functions/_shared/supreme-x509-certificate.ts`. It extracts the
signed TBSCertificate bytes, serial number, issuer and subject encodings,
validity, SubjectPublicKeyInfo, signature algorithm OID, signature BIT STRING,
and extension OIDs/values. The fixture extractor now exports complete DER
certificate chains from the pinned upstream PEM corpus, and a Deno test parses
those real chains and checks that the Android Key Attestation extension occurs
exactly once on the leaf.

This is **only a parser feasibility milestone**. It does not verify certificate
signatures, construct or validate a certification path, select Google trust
anchors, enforce Android-specific RKP chain roles, apply Google's certificate
validity exceptions, check revocation, or authorize an app. The parser must not
be used by an authentication endpoint to accept a device.

Next implementation gates are: (1) compare parsed X.509 fields and exact signed
bytes against a trusted independent implementation; (2) implement and
differentially test signature verification and Android-specific path building;
(3) reproduce the pinned Kotlin verifier's unusual certificate validity and
chain-role semantics; (4) compare every acceptance/rejection result with the
Kotlin oracle across valid and invalid fixtures; and (5) benchmark within
Supabase Edge Function CPU and memory limits. Any parity gap or runtime limit
keeps app-only Supreme login disabled.


## Hosted runtime feasibility checkpoint (2026-11-07)

The current Deno X.509 path microbenchmark completed on a GitHub-hosted AMD EPYC 7763 runner under Deno 2.9.8 at an average of **3.0 ms per real Google TEE fixture path validation** (331.6 iterations/second; observed range 2.9–4.5 ms). The pinned Kotlin upstream suite and the current real-certificate parser/path-policy differential workflow also passed on the checked commit.

This is encouraging algorithmic evidence only. It is **not** a Supabase-hosted benchmark: the runner has a different CPU, memory profile, runtime configuration and network environment. Supabase currently documents a Free-plan Edge Function limit of 256 MB memory and 2 seconds of CPU time per request. The 3.0 ms runner measurement must not be converted into a hosted performance claim or treated as proof that the complete verification request fits those limits. The full request also includes bounded DER parsing, Android KeyDescription and RKP policy, WebCrypto proof verification, both Google metadata feeds, and database challenge consumption.

A live Supabase project inventory check on 2026-11-07 found only the existing `before-user-created` Edge Function deployed. No Supreme attestation verifier Edge Function is deployed. The Deno security modules in this repository are source/test components only; they are not receiving production requests.

Required next gate before any verifier endpoint is deployed or authentication is enabled:
1. Add a benchmark harness that exercises the complete verification pipeline with representative valid and invalid upstream fixtures, including the largest supported chain and metadata feed sizes.
2. Run that harness inside the actual Supabase Edge Runtime in a non-authenticating, isolated benchmark function, measuring CPU and memory through Supabase metrics; do not use a GitHub runner as a substitute.
3. If the hosted runtime exceeds limits or parity remains incomplete, stop and keep Supreme app login disabled. Do not weaken validation, split checks across requests in a way that permits partial acceptance, or introduce a paid service without explicit budget approval.
4. Only after the runtime gate passes, add a fail-closed verifier endpoint and connect it to the existing one-time challenge flow. The endpoint must not create a Supabase session or grant a role.
