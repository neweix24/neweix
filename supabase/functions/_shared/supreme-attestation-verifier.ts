import {
  ANDROID_KEY_ATTESTATION_OID,
  parseAndroidKeyDescription,
} from "./supreme-android-keydescription.ts";
import type {
  SupremeAndroidKeyPolicy,
  SupremeAndroidKeyPolicyResult,
} from "./supreme-android-attestation-policy.ts";
import { validateSupremeAndroidKeyDescription } from "./supreme-android-attestation-policy.ts";
import type { GoogleAttestationStatus } from "./supreme-google-attestation-metadata.ts";
import { verifySupremeChallengeProof } from "./supreme-attestation-proof.ts";
import {
  validateX509CertificatePath,
  type X509PathValidationResult,
} from "./supreme-x509-chain.ts";
import type { ParsedX509Certificate } from "./supreme-x509-certificate.ts";

const EC_PUBLIC_KEY_OID = "1.2.840.10045.2.1";
const P256_NAMED_CURVE_DER = new Uint8Array([
  0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07,
]);

export type SupremeAttestationVerificationInput = {
  /** Leaf-first Android key-attestation chain, including its self-issued terminator. */
  chain: readonly ParsedX509Certificate[];
  /** Google root certificates parsed from the current official root feed. */
  trustedRoots: readonly ParsedX509Certificate[];
  /** Entries parsed from the current official Google status feed. */
  revocationStatus: GoogleAttestationStatus;
  /** Current one-time challenge stored by the server. */
  challengeId: string;
  /** DER ECDSA signature returned by the Android Keystore private key. */
  proofSignature: Uint8Array;
  /** Required production APK signer digest and minimum supported app version. */
  keyPolicy: SupremeAndroidKeyPolicy;
  /** Explicit validation instant used by reference tests and deterministic checks. */
  validationTimeMs?: number;
};

export type SupremeAttestationVerificationResult = {
  chain: X509PathValidationResult;
  keyPolicy: SupremeAndroidKeyPolicyResult;
  proofOfPossessionVerified: true;
};

/** Copy untrusted typed-array input to a non-shared ArrayBuffer for WebCrypto. */
function toArrayBuffer(value: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) difference |= left[index] ^ right[index];
  return difference === 0;
}

/**
 * Import only the P-256 EC public key carried by the already-parsed leaf X.509
 * certificate. The Android KeyDescription policy separately binds this key's
 * algorithm/size/curve/origin to hardware-enforced authorization tags.
 */
export async function importSupremeAttestationProofPublicKey(
  leaf: ParsedX509Certificate,
): Promise<CryptoKey> {
  if (leaf.subjectPublicKeyAlgorithmOid !== EC_PUBLIC_KEY_OID) {
    throw new TypeError("Supreme attestation leaf must use id-ecPublicKey.");
  }
  if (
    !leaf.subjectPublicKeyParameters ||
    !equalBytes(leaf.subjectPublicKeyParameters, P256_NAMED_CURVE_DER)
  ) {
    throw new TypeError("Supreme attestation leaf must use the P-256 named curve.");
  }
  return await crypto.subtle.importKey(
    "spki",
    toArrayBuffer(leaf.subjectPublicKeyInfo),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );
}

/**
 * Compose the previously tested Supreme attestation gates in a fixed order:
 * 1. Verify Android chain roles, Android validity exceptions, Google anchor,
 *    certificate signatures and current Google revocation status.
 * 2. Decode the unique leaf Android KeyDescription extension.
 * 3. Enforce the exact Supreme package, configured production signer, server
 *    challenge, TEE/StrongBox, hardware-generated P-256 key and RootOfTrust.
 * 4. Verify domain-separated proof-of-possession using the leaf certificate key.
 *
 * This is still a verifier component, not an authentication endpoint. The
 * caller must separately consume the one-time database challenge, authenticate
 * the user's password, require AAL2 MFA, check the Supreme role, and only then
 * create a Supabase session. Any failure must abort without issuing a session.
 */
export async function verifySupremeAndroidAttestation(
  input: SupremeAttestationVerificationInput,
): Promise<SupremeAttestationVerificationResult> {
  if (input.chain.length === 0) throw new TypeError("Supreme attestation chain is empty.");

  const chain = await validateX509CertificatePath(
    input.chain,
    input.trustedRoots,
    input.revocationStatus,
    input.validationTimeMs,
  );

  const leaf = input.chain[0];
  const attestationExtensions = leaf.extensions.filter((extension) =>
    extension.oid === ANDROID_KEY_ATTESTATION_OID
  );
  if (attestationExtensions.length !== 1 || attestationExtensions[0].critical) {
    throw new TypeError("Supreme attestation leaf must contain exactly one non-critical KeyDescription extension.");
  }

  const description = parseAndroidKeyDescription(attestationExtensions[0].value);
  const keyPolicy = validateSupremeAndroidKeyDescription(description, input.keyPolicy);
  const publicKey = await importSupremeAttestationProofPublicKey(leaf);
  const proofOfPossessionVerified = await verifySupremeChallengeProof(
    publicKey,
    input.challengeId,
    input.keyPolicy.expectedChallenge,
    input.proofSignature,
  );
  if (!proofOfPossessionVerified) {
    throw new TypeError("Supreme Android challenge proof-of-possession is invalid.");
  }

  return { chain, keyPolicy, proofOfPossessionVerified: true };
}
