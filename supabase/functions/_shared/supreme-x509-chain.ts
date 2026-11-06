import { parseDer, type DerElement } from "./supreme-attestation-der.ts";
import type { GoogleAttestationStatus } from "./supreme-google-attestation-metadata.ts";
import { isGoogleAttestationSerialBlocked } from "./supreme-google-attestation-metadata.ts";
import { verifyX509CertificateSignature } from "./supreme-x509-signature.ts";
import type { ParsedX509Certificate } from "./supreme-x509-certificate.ts";

const MIN_CHAIN_CERTIFICATES = 3;
const MAX_CHAIN_CERTIFICATES = 10;
const ANDROID_ATTESTATION_OID = "1.3.6.1.4.1.11129.2.1.17";
const DN_COMMON_NAME_OID = "2.5.4.3";
const DN_ORGANIZATION_OID = "2.5.4.10";
const DN_SERIAL_NUMBER_OID = "2.5.4.5";

export type AndroidProvisioningMethod =
  | "FACTORY_PROVISIONED"
  | "REMOTELY_PROVISIONED"
  | "UNKNOWN";

export type X509PathValidationResult = {
  trustAnchorMatched: true;
  provisioningMethod: AndroidProvisioningMethod;
  chainRolesValidated: number;
  validityCertificatesChecked: number;
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

function decodeOid(element: DerElement): string {
  if (
    element.tagClass !== "universal" || element.tagNumber !== 6 ||
    element.constructed || element.value.length === 0
  ) {
    throw new TypeError("Expected a primitive DER OBJECT IDENTIFIER.");
  }
  const components: bigint[] = [];
  let current = 0n;
  let active = false;
  for (const byte of element.value) {
    if (!active && byte === 0x80) throw new TypeError("Non-canonical DER OID component.");
    current = (current << 7n) | BigInt(byte & 0x7f);
    active = true;
    if ((byte & 0x80) === 0) {
      components.push(current);
      current = 0n;
      active = false;
    }
  }
  if (active || components.length === 0) throw new TypeError("Truncated DER OBJECT IDENTIFIER.");
  const combined = components.shift()!;
  const first = combined < 40n ? 0n : combined < 80n ? 1n : 2n;
  return [first, combined - first * 40n, ...components].map(String).join(".");
}

function decodeNameString(element: DerElement): string {
  if (element.tagClass !== "universal" || element.constructed) {
    throw new TypeError("Distinguished-name attribute must be a primitive universal string.");
  }
  switch (element.tagNumber) {
    case 12:
      return new TextDecoder("utf-8", { fatal: true }).decode(element.value);
    case 19:
    case 22:
      if (element.value.some((byte) => byte > 0x7f)) {
        throw new TypeError("Non-ASCII PrintableString/IA5String in distinguished name.");
      }
      return String.fromCharCode(...element.value);
    case 20:
      return Array.from(element.value, (byte) => String.fromCharCode(byte)).join("");
    case 30: {
      if (element.value.length % 2 !== 0) throw new TypeError("Malformed BMPString in distinguished name.");
      let result = "";
      for (let index = 0; index < element.value.length; index += 2) {
        result += String.fromCharCode((element.value[index] << 8) | element.value[index + 1]);
      }
      return result;
    }
    case 28: {
      if (element.value.length % 4 !== 0) throw new TypeError("Malformed UniversalString in distinguished name.");
      const points: number[] = [];
      for (let index = 0; index < element.value.length; index += 4) {
        const point = new DataView(
          element.value.buffer,
          element.value.byteOffset + index,
          4,
        ).getUint32(0, false);
        if (point > 0x10ffff || (point >= 0xd800 && point <= 0xdfff)) {
          throw new TypeError("Invalid Unicode scalar in distinguished name.");
        }
        points.push(point);
      }
      return String.fromCodePoint(...points);
    }
    default:
      throw new TypeError(`Unsupported ASN.1 string type in distinguished name: ${element.tagNumber}`);
  }
}

function readNameAttributes(nameDer: Uint8Array): Map<string, string[]> {
  const name = parseDer(nameDer, { maxInputBytes: 16 * 1024, maxDepth: 8, maxNodes: 128 });
  if (name.tagClass !== "universal" || name.tagNumber !== 16 || !name.constructed) {
    throw new TypeError("X.509 Name must be a DER SEQUENCE.");
  }
  const attributes = new Map<string, string[]>();
  for (const rdn of name.children) {
    if (rdn.tagClass !== "universal" || rdn.tagNumber !== 17 || !rdn.constructed) {
      throw new TypeError("X.509 RelativeDistinguishedName must be a DER SET.");
    }
    for (const attribute of rdn.children) {
      if (
        attribute.tagClass !== "universal" || attribute.tagNumber !== 16 ||
        !attribute.constructed || attribute.children.length !== 2
      ) {
        throw new TypeError("Malformed X.509 AttributeTypeAndValue.");
      }
      const oid = decodeOid(attribute.children[0]);
      if (
        oid !== DN_COMMON_NAME_OID && oid !== DN_ORGANIZATION_OID &&
        oid !== DN_SERIAL_NUMBER_OID
      ) continue;
      const value = decodeNameString(attribute.children[1]);
      const values = attributes.get(oid) ?? [];
      values.push(value);
      attributes.set(oid, values);
    }
  }
  return attributes;
}

/** Mirrors KeyAttestationCertPath.provisioningMethod() from the pinned Google verifier. */
export function classifyAndroidProvisioningMethod(
  lastIntermediateSubject: Uint8Array,
): AndroidProvisioningMethod {
  const attributes = readNameAttributes(lastIntermediateSubject);
  if (attributes.has(DN_SERIAL_NUMBER_OID)) return "FACTORY_PROVISIONED";
  const commonNames = attributes.get(DN_COMMON_NAME_OID) ?? [];
  const organizations = attributes.get(DN_ORGANIZATION_OID) ?? [];
  if (commonNames.includes("Droid CA2") && organizations.includes("Google LLC")) {
    return "REMOTELY_PROVISIONED";
  }
  return "UNKNOWN";
}

function enforceAndroidChainRoles(
  chain: readonly ParsedX509Certificate[],
): AndroidProvisioningMethod {
  const provisioningMethod = classifyAndroidProvisioningMethod(chain[chain.length - 2].subject);
  if (provisioningMethod === "FACTORY_PROVISIONED" && chain.length !== 4) {
    throw new TypeError("Factory-provisioned Android chain must contain exactly 4 certificates.");
  }
  if (provisioningMethod === "REMOTELY_PROVISIONED" && chain.length !== 5) {
    throw new TypeError("RKP Android chain must contain exactly 5 certificates.");
  }
  if (provisioningMethod === "UNKNOWN" && chain.length !== 3 && chain.length !== 4) {
    throw new TypeError("Unknown Android chain must contain exactly 3 or 4 certificates.");
  }

  for (let index = 0; index < chain.length; index++) {
    const extensions = chain[index].extensions.filter((extension) =>
      extension.oid === ANDROID_ATTESTATION_OID
    );
    if (index === 0) {
      if (extensions.length !== 1 || extensions[0].critical) {
        throw new TypeError("Android attestation extension must appear exactly once as non-critical on the target certificate.");
      }
    } else if (extensions.length !== 0) {
      throw new TypeError(`Android attestation extension is forbidden at non-target certificate index ${index}.`);
    }
  }
  return provisioningMethod;
}

function parseX509Time(element: DerElement): number {
  if (element.tagClass !== "universal" || element.constructed) {
    throw new TypeError("X.509 validity time must be a primitive universal time value.");
  }
  const encoded = String.fromCharCode(...element.value);
  let year: number;
  let month: number;
  let day: number;
  let hour: number;
  let minute: number;
  let second: number;
  if (element.tagNumber === 23) {
    const match = encoded.match(/^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/u);
    if (!match) throw new TypeError("X.509 UTCTime is not canonical DER.");
    const yy = Number(match[1]);
    year = yy >= 50 ? 1900 + yy : 2000 + yy;
    month = Number(match[2]);
    day = Number(match[3]);
    hour = Number(match[4]);
    minute = Number(match[5]);
    second = Number(match[6]);
  } else if (element.tagNumber === 24) {
    const match = encoded.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/u);
    if (!match) throw new TypeError("X.509 GeneralizedTime is not canonical DER.");
    year = Number(match[1]);
    month = Number(match[2]);
    day = Number(match[3]);
    hour = Number(match[4]);
    minute = Number(match[5]);
    second = Number(match[6]);
  } else {
    throw new TypeError("X.509 validity contains an unsupported ASN.1 time type.");
  }
  if (
    year < 1 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31 ||
    hour > 23 || minute > 59 || second > 59
  ) {
    throw new TypeError("X.509 validity contains an out-of-range time component.");
  }
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, 0);
  if (
    date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day || date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute || date.getUTCSeconds() !== second
  ) {
    throw new TypeError("X.509 validity contains an invalid calendar date.");
  }
  const timestamp = date.getTime();
  if (!Number.isFinite(timestamp)) throw new TypeError("X.509 validity date is outside the supported range.");
  return timestamp;
}

function parseCertificateValidity(certificate: ParsedX509Certificate): {
  notBefore: number;
  notAfter: number;
} {
  const validity = parseDer(certificate.validity, {
    maxInputBytes: 1024,
    maxDepth: 2,
    maxNodes: 3,
  });
  if (
    validity.tagClass !== "universal" || validity.tagNumber !== 16 ||
    !validity.constructed || validity.children.length !== 2
  ) {
    throw new TypeError("X.509 Validity must contain exactly notBefore and notAfter.");
  }
  const notBefore = parseX509Time(validity.children[0]);
  const notAfter = parseX509Time(validity.children[1]);
  if (notAfter < notBefore) throw new TypeError("X.509 certificate validity interval is inverted.");
  return { notBefore, notAfter };
}

/**
 * Follow the pinned Android KeyAttestationCertPathValidator validity rules:
 * - the terminal self-issued certificate is a trust-anchor candidate, not checked;
 * - the target/leaf certificate is deliberately not checked (device clock skew);
 * - notBefore is always enforced on all other path certificates;
 * - expired factory-provisioned certificates are tolerated because their keys
 *   cannot be safely rotated; expired RKP/unknown intermediates are rejected.
 */
function validateCertificateValidity(
  chain: readonly ParsedX509Certificate[],
  provisioningMethod: AndroidProvisioningMethod,
  validationTimeMs: number,
): number {
  if (!Number.isFinite(validationTimeMs)) throw new TypeError("Invalid certificate validation timestamp.");
  let checked = 0;
  for (let index = 1; index < chain.length - 1; index++) {
    const { notBefore, notAfter } = parseCertificateValidity(chain[index]);
    checked++;
    if (notBefore > validationTimeMs) {
      throw new TypeError(`Android chain certificate at index ${index} is not yet valid.`);
    }
    if (notAfter < validationTimeMs && provisioningMethod !== "FACTORY_PROVISIONED") {
      throw new TypeError(`Android chain certificate at index ${index} has expired.`);
    }
  }
  return checked;
}

/**
 * Validate the bounded Android X.509 path rules from the pinned Google verifier.
 * Input is leaf-first and includes a final self-issued certificate. That final
 * certificate is checked for self-issuance but is not part of the validated
 * CertPath; the configured Google trust anchor is selected by matching the
 * issuer of the highest non-root path certificate and then verifying its
 * signature with the anchor key.
 *
 * This stage checks chain roles, target-only attestation extension placement,
 * Android-specific validity exceptions, signatures, and Google status entries.
 * KeyDescription content policy, APK identity, challenge proof, MFA, and login
 * authorization remain separate validation stages.
 */
export async function validateX509CertificatePath(
  chain: readonly ParsedX509Certificate[],
  trustedRoots: readonly ParsedX509Certificate[],
  revocationStatus: GoogleAttestationStatus,
  validationTimeMs = Date.now(),
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

  const provisioningMethod = enforceAndroidChainRoles(chain);
  const validityCertificatesChecked = validateCertificateValidity(
    chain,
    provisioningMethod,
    validationTimeMs,
  );

  // The pinned Google provider selects the configured TrustAnchor by matching
  // the issuer of the last non-root path certificate. Exact root DER equality
  // is intentionally not required because Google can reissue the root cert.
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

  // The final self-issued certificate is excluded from both CertPath and
  // revocation checking, matching KeyAttestationCertPathValidator.
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
    provisioningMethod,
    chainRolesValidated: chain.length,
    validityCertificatesChecked,
    signatureLinksVerified,
    revocationEntriesChecked,
  };
}
