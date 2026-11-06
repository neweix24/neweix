# Supreme Attestation Reference Verifier — Implementation Review

Status: source review only; no production verifier is implemented by this document.

## Reviewed source

- Repository: `android/keyattestation`
- Immutable commit: `0e3ac2fdd54799d779e1979a96fbcba0361b2089`
- License: Apache-2.0 (upstream LICENSE)
- CI workflow: `.github/workflows/supreme-keyattestation-reference.yml`
- The upstream commit is unsigned. The SHA pin makes the checkout reproducible, not publisher-authenticated; review source before relying on it.

## Why a small Deno rewrite is unsafe

The pinned implementation is not just a PEM parser plus a WebCrypto signature check:

1. It registers a dedicated `KeyAttestation` CertPathValidator provider. Its source explains that older Android attestation chains may not fully conform to RFC 5280 and therefore need Android-specific path validation rather than a generic PKIX-only path.
2. The path validator performs ordered issuer/subject chaining, certificate signature verification, validity checks and Android-specific expectations across factory-provisioned and remotely provisioned (RKP) chain shapes.
3. The verifier applies Google's revocation serial checker as part of path validation, evaluates the attestation extension, checks the challenge and expected AttestationApplicationId, and returns the public key and security/boot properties.
4. RKP provisioning information and certificate placement are part of the path semantics; treating every chain as a fixed leaf/intermediate/root sequence is incorrect.
5. The upstream tests cover path validation failures, invalid signatures, issuer mismatch, certificate validity exceptions, revocation, chain extension attacks and RKP-era certificate chains. The testdata corpus includes SDK 28, 34, 36 and 37 device generations, plus invalid-chain samples.

The existing NEWEIX Deno modules only fetch/parse Google metadata and verify a challenge proof after a trusted verifier has already produced a public key. They do not parse X.509, establish a trust path, parse Android Keymaster/KeyMint extensions, or enforce RKP semantics.

## Additional chain-validation semantics confirmed from pinned source

A closer review of `provider/KeyAttestationCertPath.kt`, `provider/KeyAttestationCertPathValidator.kt`, `provider/RevocationChecker.kt` and `Verifier.kt` establishes several policy details that a Deno port must preserve:

- The submitted Android chain is ordered leaf first and includes its root certificate. The leaf is the target key certificate; the second certificate is the attestation certificate; factory and RKP provisioning can add different intermediate roles before the root. The root must be self-issued, and the path builder excludes the trust anchor from the validated CertPath.
- The attestation extension belongs on the leaf/target certificate only. The validator rejects an attestation extension on an intermediate and rejects unexpected certificates or an extra fake attestation extension after the target.
- The validator walks from the trust anchor toward the leaf, checks issuer/subject name chaining and each certificate signature, and applies provisioning-specific role transitions. Factory-provisioned and remotely provisioned (RKP) chains are not interchangeable.
- Certificate validity handling is intentionally non-standard: the final target/leaf certificate validity is not checked; an expired factory-provisioned certificate is tolerated for key-rotation reasons; an expired RKP certificate is not. A generic RFC 5280 validator may therefore disagree with the maintained Android verifier.
- The upstream revocation checker compares unpadded lowercase hexadecimal certificate serial numbers against a supplied set. The caller must fetch and validate Google's current status feed and pass a complete trustworthy revoked-serial set; the checker itself does not fetch the feed.
- The verifier's success result is still not sufficient on its own: its challenge checker, expected AttestationApplicationId constraints and generic security constraints are applied after path validation. NEWEIX must additionally enforce its exact package/signer policy, hardware-backed security level, locked device, Verified boot, and proof of possession.

These behaviors are source-reviewed against the pinned immutable commit; they are not yet implemented as a NEWEIX production verifier. The Deno parser differential fixture job remains a release gate.

## Required Deno parity work before any security decision

- Select a maintained X.509 implementation that runs in the deployed Supabase Deno runtime and supports custom path validation behavior required by Android attestation.
- Parse the Android key-attestation and provisioning-info ASN.1 structures with bounded, strict parsing.
- Reproduce the pinned verifier's trust-path ordering, signature, validity, revocation, extension, challenge and application-ID decisions.
- Port or safely consume the upstream valid and invalid fixture corpus, retaining Apache-2.0 attribution and license.
- Build a differential test harness: every fixture must be run against the pinned Kotlin reference and the Deno candidate; any mismatch is a release blocker.
- Add adversarial tests for duplicate/untrusted extensions, chain reordering, path ambiguity, malformed ASN.1, oversized inputs, stale roots/status and verifier timeouts.
- Keep the endpoint non-authenticating until all tests pass and production signer digest is configured.

## Current safe state

- Android challenge generation and one-time challenge consumption are implemented and tested.
- Deno proof-of-possession and Google metadata retrieval are supporting modules only.
- The pinned Kotlin reference suite is executed in CI, not in production.
- No paid hosting or new service has been enabled.
- No production signing-certificate digest is configured.
- Supreme app-only login remains disabled; Admin/Manager/Employee/Staff authentication is not changed.

## Why the implementation is deliberately staged

A false positive in attestation could grant Supreme access to a browser, emulator, modified APK or untrusted device. A false negative only blocks the Supreme app temporarily. Until the Deno implementation demonstrates parity with the maintained reference, fail-closed behavior is the correct choice under the zero-budget constraint.

## Exact upstream implementation points confirmed in source review

The pinned source review confirmed these concrete components:

- `Verifier.kt`: orchestrates parsing, path validation, challenge checking, attestation-extension parsing and constraint evaluation. It returns a typed result; a path-valid chain alone is not an authorization decision.
- `provider/KeyAttestationCertPathValidator.kt`: implements a custom `CertPathValidatorSpi`. The source explicitly explains that some older Android chains do not fully conform to RFC 5280. It validates issuer/subject chaining, certificate signatures, validity and expected chain roles, including remotely provisioned (RKP) paths.
- `provider/RevocationChecker.kt`: rejects revoked certificate serials during path checking. The caller must supply a fresh, trustworthy revocation set; an empty or stale fallback is not acceptable for NEWEIX.
- `VerifierTest.kt` and `provider/KeyAttestationCertPathValidatorTest.kt`: exercise the verifier and path-validation behavior, including valid fixture chains, wrong trust anchors, wrong issuer, invalid signature, certificate validity and RKP paths.
- Upstream fixture corpus includes real chain samples under `testdata/blueline/sdk28`, `testdata/akita/sdk34`, `testdata/caiman/sdk36`, `testdata/frankel/sdk37`, `testdata/tegu/sdk36` and `testdata/tokay/sdk37`, plus intentionally invalid samples under `testdata/invalid`.

This source review is why the NEWEIX implementation must not replace path validation with a simple sequence of certificate signature checks. The Kotlin reference CI success proves the pinned upstream project tests pass in CI; it does not prove a NEWEIX Deno verifier exists or is equivalent.


## Differential fixture run — verified CI result

The NEWEIX workflow `.github/workflows/supreme-keyattestation-reference.yml` now runs the pinned Kotlin reference suite and extracts the Android key-attestation extension from the upstream PEM certificate corpus. It then parses those real extension DER values with the NEWEIX Deno KeyDescription decoder and compares the decoded output with the companion upstream JSON expectations.

The successful run on the PR head associated with workflow run `42289300538` completed both the upstream verifier suite and the real-certificate differential step. The harness covered 23 certificate fixtures. Comparisons include the KeyDescription version/security-level/challenge fields, AttestationApplicationId package/version/signer digest data, and RootOfTrust verified-boot key, device-locked flag, verified-boot state and optional verified-boot hash where present.

This is a structural-extension differential check only. It does **not** mean that NEWEIX validates X.509 trust paths, Google's trust anchors, revocation, RKP provisioning roles, certificate validity, or the complete upstream verifier decision. The Kotlin reference suite passing in CI does not execute Kotlin as the production NEWEIX verifier. No attestation endpoint or Supreme authentication route accepts these parser results.


### Exact certificate order and RKP provisioning extension

The pinned source review of `provider/KeyAttestationCertPath.kt`, `provider/KeyAttestationCertPathValidator.kt` and `Verifier.kt` confirms the submitted chain order:

1. target/leaf certificate containing the Android key-attestation extension;
2. attestation certificate, containing the provisioning-information extension for remotely provisioned chains;
3. factory intermediate for factory chains, or RKP server certificate for remotely provisioned chains;
4. an additional RKP intermediate for remotely provisioned chains;
5. root certificate/trust anchor.

The software-backed chain uses the shorter root → attestation → target shape. The validator walks the non-root path from the trust-anchor side toward the target and applies distinct role transitions for factory and RKP provisioning. It requires the key-attestation extension on the target only and rejects it on attestation/intermediate certificates or any extra certificate after the target. This matches AOSP's documented certificate-chain order: entry 0 is the attestation certificate for the attested key and contains the key-attestation extension. AOSP documents the separate provisioning-information extension OID `1.3.6.1.4.1.11129.2.1.30` as CBOR; the pinned verifier reads it from the attestation certificate for RKP chains.

This source review corrects earlier generic wording that suggested searching for the nearest key-attestation extension from the root side or accepting it on a non-leaf certificate. NEWEIX must follow the pinned verifier's exact role model and fail closed on any extension-placement mismatch.


### RKP provisioning-information CBOR groundwork

A bounded structural parser now exists at `supabase/functions/_shared/supreme-android-provisioning-info.ts` for extension OID `1.3.6.1.4.1.11129.2.1.30`. It requires the AOSP-defined certificates-issued integer and validated-attested-entity text fields, parses the optional lost-device boolean, rejects duplicate keys, invalid UTF-8, malformed/non-canonical integer or length encodings, indefinite-length items, trailing bytes and over-limit input/nesting/node counts. Unknown future map fields are skipped under the same resource limits to preserve the unversioned schema's forward compatibility.

Its tests cover TEE and StrongBox values, both lost-device states, missing/duplicate/wrong-typed fields, invalid entity values, malformed and trailing CBOR, future nested fields, floating-point values in ignored future fields, input size and nesting limits. This module is only a CBOR parser: it is not wired to X.509 extraction, does not establish that the extension came from the RKP attestation certificate, and cannot accept a device or authorize a Supreme login. The caller must apply an explicit policy (including rejection when `isLostDevice === true`) only after the trusted chain verifier has validated certificate roles.


### Exact upstream certificate-chain ordering and RKP extension placement

The pinned upstream `KeyAttestationCertPath` source defines the `KeyStore.getCertificateChain()` input order as leaf (target) first, attestation certificate second, optional factory/RKP intermediate(s), and self-issued root last. The root is the trust anchor and is excluded from the validator's `CertPath` list. Its custom validator reverses the non-root path for signature/name/validity checks, but the attestation-extension policy remains tied to the original target leaf: only the target certificate may contain OID `1.3.6.1.4.1.11129.2.1.17`. For remotely provisioned chains, the provisioning-information extension OID `1.3.6.1.4.1.11129.2.1.30` is carried by the second certificate (the attestation certificate), not by the leaf or arbitrary intermediates.

The fixture extractor now reads the provisioning extension from certificate index 1 and emits its inner CBOR alongside the leaf KeyDescription DER when present. This permits the Deno CBOR parser to run against actual RKP certificate material rather than hand-authored CBOR examples. This extraction remains test-only and performs no path validation. The Deno test currently confirms bounded structural parsing of the extracted CBOR; it is not yet a semantic differential comparison of every RKP field with an independently decoded upstream oracle.

The upstream validator's path semantics are more specific than generic PKIX: chain classification uses provisioning method and issuer identity; each certificate's issuer/subject chaining and signature are checked in root-to-leaf order; validity handling intentionally excludes the final target certificate and tolerates expired factory-provisioned certificates; only the target may carry the attestation extension; and RKP chains have distinct intermediate/server steps. Any Deno port must match these rules and upstream positive/negative fixtures, including malformed and fake-extension chains, before it can be trusted. Do not replace this with a generic `X509Certificate.verify()` loop.
