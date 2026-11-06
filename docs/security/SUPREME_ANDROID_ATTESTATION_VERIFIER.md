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
   - For remotely provisioned chains, parse the provisioning-information extension from the index-1 attestation certificate. Its OID is `1.3.6.1.4.1.11129.2.1.30`; AOSP specifies a CBOR map containing certificates-issued and validated-attested-entity fields, with an optional lost-device flag. Bound its size and types and define explicit policy for a device reported as lost. This CBOR extension is distinct from the leaf's DER KeyDescription extension. The supporting bounded parser is `supabase/functions/_shared/supreme-android-provisioning-info.ts`; it follows the pinned upstream schema (required CBOR key `1`, `certificatesIssued`), mirrors its negative/overflow clamping, skips other fields under resource limits, and rejects malformed CBOR. It is a parser only and must be invoked only after a trusted chain verifier has established the extension's certificate position.
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

## Deno verifier groundwork

A bounded DER TLV parser exists at `supabase/functions/_shared/supreme-attestation-der.ts`. It enforces input-size, depth and node-count limits and rejects malformed/non-minimal lengths, malformed high-numbered context tags, trailing bytes and non-canonical INTEGERs.

The candidate now has separate modules for:
- Android KeyDescription and AuthorizationList decoding, including nested AttestationApplicationId;
- X.509 parsing, signature verification, Google trust-anchor selection, path-name/signature checks, Android provisioning-role classification and the pinned validity exceptions;
- parsing Google root and revocation feeds;
- decoding RKP provisioning information; and
- the Supreme-specific app identity and hardware policy described below.

The pinned Java 21 differential harness compares 103 real certificates from 23 upstream PEM chains. The Deno X.509 parser matches the independent JDK output for TBSCertificate, serial, signature algorithm and parameters, issuer, subject, SPKI, signature and extensions. A separate signature test compares 80 real certificate-to-issuer signature results against Java Security and also rejects tampered signatures.

The bounded path candidate validates a pinned positive Google TEE chain against the current pinned Google root set, checks child/issuer name linkage and certificate signatures, applies the Android chain-role and validity rules, and checks non-root serials against the supplied Google status entries. The Android path policy was compared against six synthetic chains generated by the pinned Kotlin validator: valid factory, valid RKP, expired factory intermediate/attestation, expired RKP attestation, expired leaf, and not-yet-valid attestation. All six Deno allow/reject decisions matched the Kotlin output.

**Known gaps before a production verifier exists:** the Deno path candidate is not yet a complete RFC 5280/Google Key Attestation path validator. It does not yet enforce every CA BasicConstraints, KeyUsage, path-length and critical-extension rule; RKP provisioning-information is parsed separately but is not yet bound to and enforced at the exact attestation-certificate chain position; certificate constraints and root-set rollover still need broader positive/negative fixture coverage. The candidate modules are not wired together into a server endpoint and cannot authorize a Supreme login.

## Android KeyDescription and app-identity policy

The Deno decoder at `supabase/functions/_shared/supreme-android-keydescription.ts` parses the eight-field KeyDescription envelope, known AuthorizationList tags, explicit tagging, duplicate-tag rejection, and RootOfTrust schema. It records AuthorizationList tag order rather than silently sorting it. The nested tag-709 AttestationApplicationId parser preserves upstream signer octets and BigInteger package versions; the policy matcher separately requires a configured 32-byte SHA-256 signing digest.

The policy helper at `supabase/functions/_shared/supreme-android-attestation-policy.ts` now requires:
- exact package `com.neweix.supreme`, configured minimum package version and a configured, non-zero 32-byte SHA-256 digest of the production APK signing certificate;
- exact match to the server's 32-byte attestation challenge;
- matching TEE or StrongBox attestation and KeyMint security levels;
- hardware-enforced EC P-256, 256-bit key size, SIGN and VERIFY purposes, SHA-256 digest and GENERATED origin;
- hardware-enforced RootOfTrust with locked device and VERIFIED boot state; and
- AttestationApplicationId in the software-enforced AuthorizationList, with no `UnknownPackage` fallback.

The policy unit tests use synthetic test-only app signers. They verify positive TEE/StrongBox inputs and negative package, version, signer, challenge, software/mismatched security level, algorithm, key size, curve, origin, purpose, digest, bootloader and boot-state cases. These tests **do not** prove that a production-signed APK currently matches the policy: the production signing-certificate SHA-256 digest has not been configured.

### Upstream compatibility review — AttestationApplicationId

The pinned Google Kotlin source at `android/keyattestation@0e3ac2fdd54799d779e1979a96fbcba0361b2089` was reviewed directly (`Extension.kt`, `AttestationApplicationId.from`, `AttestationPackageInfo.from`, and `toAttestationApplicationId`). It confirms that tag 709 is an OCTET STRING containing a DER SEQUENCE of two SET values; package names are strict UTF-8 OCTET STRINGs and package versions are ASN.1 INTEGER/BigInteger values. The upstream parser preserves signer digest octets as ByteString and does not itself enforce a 32-byte length. Therefore the NEWEIX structural decoder now preserves arbitrary signer octet lengths for parser compatibility, while the *NEWEIX policy matcher* requires the configured expected signing-certificate SHA-256 and candidate digest to be exactly 32 bytes before a match can succeed. Package versions remain arbitrary non-negative BigInt values rather than being truncated to a 32-bit integer. This is a source-compatibility correction, not evidence of certificate verification parity.


### Google upstream fixture-vector tests

The app-ID unit suite now includes expected semantic vectors transcribed from the pinned upstream verifier's JSON outputs for:
- `testdata/akita/sdk34/TEE_EC_NONE.json` — package `com.google.wireless.android.security.attestationverifier.collector`, version `0`, signer digest `EDk47kU35Z6O55L2VFBPuDRvxrNG0LvEQV/DOfz8jsE=`.
- `testdata/caiman/sdk36/TEE_EC_RKP.json` — package `com.google.android.attestation`, version `0`, same 32-byte signer digest.

These are semantic compatibility vectors copied from upstream's decoded JSON expectations; they are **not** direct parsing of the PEM certificate fixtures and do not demonstrate end-to-end X.509 extension extraction. The pinned upstream Kotlin workflow separately runs its own real-certificate test suite. A true cross-runtime differential harness that extracts the extension from each PEM fixture and compares Deno output with Kotlin output remains a release gate.


## Verified fixture and policy scope

The most recent completed reference runs before the app-policy change are:
- `42301319361`: pinned Kotlin suite, 23-chain/103-certificate Java differential, 80 signature comparisons, Google trust-anchor path and six Kotlin-generated Android path-policy fixtures all passed.
- `42301031567`: Deno lint/type-check and full Supabase migration/security tests passed.

The app-identity and hardware-policy tests were added afterwards and are being re-run in CI. Their synthetic test signer is not the production APK signing certificate. None of these runs is a production deployment or an end-to-end Supreme authentication test.


## Supreme app identity and hardware policy decoder

A policy-only Deno module now exists at `supabase/functions/_shared/supreme-android-attestation-policy.ts`. It consumes an already decoded `AndroidKeyDescription` and requires all of the following before returning a policy result:

- Exact package name `com.neweix.supreme`, a configured minimum package version, and a configured 32-byte SHA-256 digest of the **production APK signing certificate**. There is no `UnknownPackage` fallback.
- Exact match to the current 32-byte server challenge embedded in the Android attestation.
- Matching non-software attestation and KeyMint security levels: TEE or StrongBox.
- Hardware-enforced EC P-256, 256-bit key, SIGN and VERIFY purposes, SHA-256 digest, and GENERATED origin.
- Hardware-enforced RootOfTrust with a locked device and VERIFIED boot state.
- The AttestationApplicationId must be in the software-enforced AuthorizationList, as read by the pinned Google verifier.

The expected production signer digest is deliberately a required runtime input and is not hard-coded: the current APK artifact is debug-signed, and a production signing certificate digest has not yet been configured. An all-zero/missing digest is rejected. The policy tests use synthetic test-only signer values and do not establish the identity of a production APK.

This helper is still not connected to an authentication route. It does not fetch or validate the Google metadata feeds, validate the certificate chain, verify the challenge proof-of-possession, consume an auth challenge, authenticate a password, satisfy AAL2 MFA, or grant a Supabase session/role. No Supreme login behavior has changed. Admin/Manager/Employee/Staff login remains outside this work.
