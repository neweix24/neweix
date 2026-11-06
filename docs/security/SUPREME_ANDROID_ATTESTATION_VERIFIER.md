# Supreme Android Attestation Verifier — Design and Rollout

Status: design baseline for implementation on `feat/supreme-server-attestation-verifier`.
This document does **not** enable or claim app-only Supreme authentication.

## Security objective

Only the signed NEWEIX Supreme Android application, running on a device that produces acceptable hardware-backed Android Key Attestation, may proceed to Supreme authentication. The existing Supreme role check and Supabase AAL2 MFA remain mandatory. Admin, Manager, Employee and Staff authentication must remain unchanged.

A private URL, WebView User-Agent, package name supplied by the client, static APK secret, or custom HTTP header is not proof of app identity.

## Runtime decision — superseded by the zero-cost constraint

The earlier Deno-port proposal below is not an approved verifier implementation. The separate decision record at `docs/security/SUPREME_ATTESTATION_RUNTIME_DECISION.md` is authoritative.

The project must not add a paid JVM host or paid Cloudflare plan. A Deno-native implementation in the existing Supabase Edge Function environment is only a candidate for avoiding new hosting costs; it is not trusted merely because it runs server-side. It must implement full X.509 path validation and Android Keymaster/KeyMint policy, then pass the same valid and invalid fixture corpus as the maintained Android Kotlin verifier. Any mismatch, missing fixture, stale trust metadata, or verifier outage must fail closed.

The existing Deno proof-of-possession and Google metadata modules are supporting components only. They do not validate certificate paths or establish Android hardware attestation. No authentication route may treat them as a successful attestation decision.

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
   - Require the documented Android Keystore chain order: index 0 is the target/leaf certificate containing the key-attestation extension; index 1 is the attestation certificate; provisioning intermediates follow as applicable; the final entry is the root trust anchor. The pinned Google verifier explicitly models these roles.
   - Require key-attestation extension OID `1.3.6.1.4.1.11129.2.1.17` on the target/leaf certificate only. Reject it on the attestation certificate or any intermediate, and reject an extra certificate after the target. Do not search for a substitute extension elsewhere in the chain.
   - For remotely provisioned chains, parse the provisioning-information extension from the index-1 attestation certificate. Its OID is `1.3.6.1.4.1.11129.2.1.30`; AOSP specifies a CBOR map containing certificates-issued and validated-attested-entity fields, with an optional lost-device flag. Bound its size and types and define explicit policy for a device reported as lost. This CBOR extension is distinct from the leaf's DER KeyDescription extension. The supporting bounded parser is `supabase/functions/_shared/supreme-android-provisioning-info.ts`; it validates the required fields, optional lost-device boolean, duplicate keys, UTF-8, canonical integer/length encodings, and resource limits. It is a parser only and must be invoked only after a trusted chain verifier has established the extension's certificate position.
   - Reproduce the pinned verifier's role sequence for software, factory-provisioned and remotely provisioned chains, plus its exact root-to-leaf issuer/subject, signature, validity and revocation behavior. Do not treat factory and RKP paths as interchangeable.
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
- valid Remote Key Provisioning chains with the pinned verifier's expected intermediate roles, provisioning-information extension on the attestation certificate, and key-attestation extension on the target/leaf certificate;
- reject a chain with the key-attestation extension missing from the target/leaf, duplicated on an intermediate, or with unexpected certificates/roles; reject malformed provisioning-information CBOR;
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

## Deno parser groundwork

A bounded DER TLV parser now exists at `supabase/functions/_shared/supreme-attestation-der.ts`, with negative tests for malformed/non-minimal lengths, high-numbered context-specific tags, trailing bytes, nesting depth, node count, input size and canonical non-negative INTEGERs.

This module is syntax-only. It does not parse the full Android KeyDescription/AuthorizationList schema, validate X.509 certificates or paths, authenticate Google roots, enforce RKP rules, or authorize a Supreme login. It must not be called as a verifier or used to accept an attestation. The next implementation step is to build strict schema-specific decoders on top of it and compare all decisions with the pinned Kotlin reference; the release gate remains unchanged.

## Android KeyDescription schema decoder groundwork

The Deno candidate now includes `supreme-android-keydescription.ts`. It decodes the inner DER value of the Android key-attestation extension OID `1.3.6.1.4.1.11129.2.1.17` and enforces the eight-field `KeyDescription` envelope, known `AuthorizationList` context tags, explicit tagging, duplicate-tag rejection, supported universal payload types, and the basic `RootOfTrust` field shape. It records AuthorizationList tag ordering rather than silently sorting it.

The nested `AttestationApplicationId` in AuthorizationList tag 709 is an OCTET STRING containing a DER SEQUENCE (not CBOR). The Deno candidate now decodes its package-info and signer-digest SET OF values, bounds package/signature counts, rejects malformed UTF-8, duplicate package names/digests, negative or non-canonical package versions, and invalid field shapes; it preserves arbitrary signer-digest octets for upstream parser compatibility, while the NEWEIX policy matcher requires a configured 32-byte SHA-256 digest, and exposes an exact package/minimum-version/SHA-256 signer matcher. This schema follows the pinned Google Kotlin reference source. The expected production signing digest is still not configured, so this matcher is not currently used to accept a device.

This remains a structural decoder and policy helper, not a verifier. It does not validate certificate paths or Google trust anchors, check chain placement/RKP provisioning semantics, or decide whether a device is acceptable. The parser is not connected to any authentication route. Its accepted structure must be tested against real upstream valid and invalid certificate fixtures before it can contribute to an attestation decision.


### Upstream compatibility review — AttestationApplicationId

The pinned Google Kotlin source at `android/keyattestation@0e3ac2fdd54799d779e1979a96fbcba0361b2089` was reviewed directly (`Extension.kt`, `AttestationApplicationId.from`, `AttestationPackageInfo.from`, and `toAttestationApplicationId`). It confirms that tag 709 is an OCTET STRING containing a DER SEQUENCE of two SET values; package names are strict UTF-8 OCTET STRINGs and package versions are ASN.1 INTEGER/BigInteger values. The upstream parser preserves signer digest octets as ByteString and does not itself enforce a 32-byte length. Therefore the NEWEIX structural decoder now preserves arbitrary signer octet lengths for parser compatibility, while the *NEWEIX policy matcher* requires the configured expected signing-certificate SHA-256 and candidate digest to be exactly 32 bytes before a match can succeed. Package versions remain arbitrary non-negative BigInt values rather than being truncated to a 32-bit integer. This is a source-compatibility correction, not evidence of certificate verification parity.


### Google upstream fixture-vector tests

The app-ID unit suite now includes expected semantic vectors transcribed from the pinned upstream verifier's JSON outputs for:
- `testdata/akita/sdk34/TEE_EC_NONE.json` — package `com.google.wireless.android.security.attestationverifier.collector`, version `0`, signer digest `EDk47kU35Z6O55L2VFBPuDRvxrNG0LvEQV/DOfz8jsE=`.
- `testdata/caiman/sdk36/TEE_EC_RKP.json` — package `com.google.android.attestation`, version `0`, same 32-byte signer digest.

These are semantic compatibility vectors copied from upstream's decoded JSON expectations; they are **not** direct parsing of the PEM certificate fixtures and do not demonstrate end-to-end X.509 extension extraction. The pinned upstream Kotlin workflow separately runs its own real-certificate test suite. A true cross-runtime differential harness that extracts the extension from each PEM fixture and compares Deno output with Kotlin output remains a release gate.


## Verified real-certificate parser differential result

The pinned Kotlin reference workflow and NEWEIX Deno structural decoder have been run against 23 real upstream PEM certificate fixtures. The harness extracts the key-attestation extension from each target certificate and compares KeyDescription fields, AttestationApplicationId values, and RootOfTrust values against upstream decoded JSON expectations. The latest recorded successful run is workflow `42289300538` on the PR branch.

This result validates the tested extension-decoding semantics only. It does not validate NEWEIX X.509 path building, Google trust-anchor/revocation handling, RKP provisioning-chain roles, or the full verifier decision. The Deno parser remains disconnected from authentication and cannot authorize a Supreme login.
