import type { GoogleAttestationStatus } from "./supreme-google-attestation-metadata.ts";
import { isGoogleAttestationSerialBlocked } from "./supreme-google-attestation-metadata.ts";
import { verifyX509CertificateSignature } from "./supreme-x509-signature.ts";
import type { ParsedX509Certificate } from "./supreme-x509-certificate.ts";

const MIN_CHAIN_CERTIFICATES = 3;
const MAX_CHAIN_CERTIFICATES = 10;

export type X509PathValidationResult = {
  trustAnchorMatched: true;
  signatureLinksVerified: number;
  revocationEntriesChecked: number;
};

/** Compare complete byte strings without converting certificate fields to display text. */
function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) difference |= left[index] ^ right[index];
  return difference === 0;
}

/** Return the unpadded, lower-case hexadecimal form used by Google's status feed. */
export function x509SerialToHex(serialNumber: Uint8Array): string {
  if (serialNumber.length === 0 || (serialNumber[0] & 0x80) !== 0) {
    throw new TypeError("X.509 serial must be a non-negative DER INTEGER.");
  }
  let offset = 0;
  while (offset < serialNumber.length - 1 && serialNumber[offset] === 0) offset++;
  const value = serialNumber.subarray(offset);
  if (value.every((byte) => byte === 0)) throw new TypeError("X.509 serial must not be zero.");
  return Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("")
    .replace(/^0+(?=.)/u, "");
}

/**
 * Validate the bounded X.509 path skeleton used by the pinned Android verifier:
 * input is leaf-first with the root certificate last; root is a trust anchor,
 * not a member of the certificate path. This stage checks exact DER names,
 * signatures and Google status entries. It deliberately does not implement
 * Android chain roles, validity exceptions, KeyDescription policy or login.
 *
 * The caller must provide roots and status data fetched successfully from the
 * official Google metadata endpoints. No stale fallback is accepted here.
 */
export async function validateX509CertificatePath(
  chain: readonly ParsedX509Certificate[],
  trustedRoots: readonly ParsedX509Certificate[],
  revocationStatus: GoogleAttestationStatus,
): Promise<X509PathValidationResult> {
  if (
    chain.length < MIN_CHAIN_CERTIFICATES ||
    chain.length > MAX_CHAIN_CERTIFICATES
  ) {
    throw new TypeError("Android X.509 chain length is outside accepted bounds.");
  }
  if (trustedRoots.length < 1 || trustedRoots.length > 16) {
    throw new TypeError("Google trust-anchor set is empty or exceeds its bound.");
  }
  if (revocationStatus.maxAgeSeconds <= 0) {
    throw new TypeError("Google revocation metadata has no positive freshness window.");
  }

  const root = chain[chain.length - 1];
  if (!equalBytes(root.issuer, root.subject)) {
    throw new TypeError("Final X.509 certificate is not self-issued.");
  }

  // The pinned Google provider treats the last input certificate as the
  // self-issued chain terminator, but uses a configured TrustAnchor selected
  // by the issuer of the last non-root certificate. The supplied root DER is
  // therefore not required to equal Google's current reissued root certificate.
  const topPathCertificate = chain[chain.length - 2];
  const matchingAnchors = trustedRoots.filter((anchor) =>
    equalBytes(topPathCertificate.issuer, anchor.subject)
  );
  if (matchingAnchors.length === 0) {
    throw new TypeError("No Google trust anchor matches the chain issuer name.");
  }

  let selectedAnchor: ParsedX509Certificate | null = null;
  for (const candidate of matchingAnchors) {
    if (await verifyX509CertificateSignature(topPathCertificate, candidate)) {
      selectedAnchor = candidate;
      break;
    }
  }
  if (!selectedAnchor) {
    throw new TypeError("Top path certificate does not verify under a matching Google trust anchor.");
  }

  let signatureLinksVerified = 1;
  for (let index = 0; index < chain.length - 2; index++) {
    const certificate = chain[index];
    const issuer = chain[index + 1];
    if (!equalBytes(certificate.issuer, issuer.subject)) {
      throw new TypeError(`X.509 issuer/subject name chaining failed at certificate index ${index}.`);
    }
    if (!await verifyX509CertificateSignature(certificate, issuer)) {
      throw new TypeError(`X.509 signature verification failed at certificate index ${index}.`);
    }
    signatureLinksVerified++;
  }

  // Match the pinned Kotlin KeyAttestationCertPath semantics: the final root is
  // a TrustAnchor and is excluded from CertPath revocation checking.
  let revocationEntriesChecked = 0;
  for (let index = 0; index < chain.length - 1; index++) {
    const serialHex = x509SerialToHex(chain[index].serialNumber);
    if (isGoogleAttestationSerialBlocked(serialHex, revocationStatus)) {
      throw new TypeError(`Google has blocked certificate serial at chain index ${index}.`);
    }
    revocationEntriesChecked++;
  }

  return {
    trustAnchorMatched: true,
    signatureLinksVerified,
    revocationEntriesChecked,
  };
}
