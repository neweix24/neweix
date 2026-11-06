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
