import { parseDer, type DerElement } from "./supreme-attestation-der.ts";
import type { ParsedX509Certificate } from "./supreme-x509-certificate.ts";

const RSA_ENCRYPTION_OID = "1.2.840.113549.1.1.1";
const EC_PUBLIC_KEY_OID = "1.2.840.10045.2.1";
const RSA_SIGNATURES: Readonly<Record<string, string>> = {
  "1.2.840.113549.1.1.11": "SHA-256",
  "1.2.840.113549.1.1.12": "SHA-384",
  "1.2.840.113549.1.1.13": "SHA-512",
};
const ECDSA_SIGNATURES: Readonly<Record<string, string>> = {
  "1.2.840.10045.4.3.2": "SHA-256",
  "1.2.840.10045.4.3.3": "SHA-384",
  "1.2.840.10045.4.3.4": "SHA-512",
};
const EC_CURVES: Readonly<Record<string, { name: string; width: number }>> = {
  "1.2.840.10045.3.1.7": { name: "P-256", width: 32 },
  "1.3.132.0.34": { name: "P-384", width: 48 },
  "1.3.132.0.35": { name: "P-521", width: 66 },
};

function decodeOid(element: DerElement): string {
  if (element.tagClass !== "universal" || element.tagNumber !== 6 || element.constructed || element.value.length === 0) {
    throw new TypeError("Expected a DER OBJECT IDENTIFIER.");
  }
  const arcs: bigint[] = [];
  let current = 0n;
  let active = false;
  for (const byte of element.value) {
    if (!active && byte === 0x80) throw new TypeError("Non-canonical DER OID component.");
    current = (current << 7n) | BigInt(byte & 0x7f);
    active = true;
    if ((byte & 0x80) === 0) {
      arcs.push(current);
      current = 0n;
      active = false;
    }
  }
  if (active || arcs.length === 0) throw new TypeError("Truncated DER OBJECT IDENTIFIER.");
  const combined = arcs.shift()!;
  const first = combined < 40n ? 0n : combined < 80n ? 1n : 2n;
  return [first, combined - first * 40n, ...arcs].map(String).join(".");
}

function isDerNull(value: Uint8Array | null): boolean {
  return value !== null && value.length === 2 && value[0] === 0x05 && value[1] === 0x00;
}

function integerToWidth(element: DerElement, width: number): Uint8Array {
  if (element.tagClass !== "universal" || element.tagNumber !== 2 || element.constructed) {
    throw new TypeError("ECDSA signature must contain DER INTEGER values.");
  }
  let value = element.value;
  if (value.length === 0 || (value[0] & 0x80) !== 0) throw new TypeError("ECDSA signature INTEGER must be positive.");
  if (value.length > 1 && value[0] === 0) {
    if ((value[1] & 0x80) === 0) throw new TypeError("ECDSA signature INTEGER is not minimally encoded.");
    value = value.slice(1);
  }
  if (value.length > width) throw new RangeError("ECDSA signature INTEGER exceeds curve width.");
  let nonZero = false;
  for (const byte of value) nonZero ||= byte !== 0;
  if (!nonZero) throw new TypeError("ECDSA signature INTEGER must be non-zero.");
  const result = new Uint8Array(width);
  result.set(value, width - value.length);
  return result;
}

/** Convert strict DER ECDSA (r,s) into WebCrypto's fixed-width P1363 format. */
function ecdsaDerToP1363(signature: Uint8Array, width: number): Uint8Array {
  const root = parseDer(signature, { maxInputBytes: 1024, maxDepth: 3, maxNodes: 4 });
  if (root.tagClass !== "universal" || root.tagNumber !== 16 || !root.constructed || root.children.length !== 2) {
    throw new TypeError("Malformed DER ECDSA signature sequence.");
  }
  const r = integerToWidth(root.children[0], width);
  const s = integerToWidth(root.children[1], width);
  const result = new Uint8Array(width * 2);
  result.set(r, 0);
  result.set(s, width);
  return result;
}

/**
 * Verifies one certificate's cryptographic signature using the next certificate's public key.
 * This is only a signature check: it does not establish issuer identity, path trust, validity,
 * Android RKP roles, revocation, or authorization.
 *
 * Unsupported algorithms throw instead of silently falling back.
 */
export async function verifyX509CertificateSignature(
  certificate: ParsedX509Certificate,
  issuer: ParsedX509Certificate,
): Promise<boolean> {
  const digest = RSA_SIGNATURES[certificate.signatureAlgorithmOid] ??
    ECDSA_SIGNATURES[certificate.signatureAlgorithmOid];
  if (!digest) throw new TypeError(`Unsupported X.509 signature algorithm OID: ${certificate.signatureAlgorithmOid}`);

  let keyAlgorithm: RsaHashedImportParams | EcKeyImportParams;
  let verifyAlgorithm: AlgorithmIdentifier | EcdsaParams;
  let signature = certificate.signature;

  if (Object.hasOwn(RSA_SIGNATURES, certificate.signatureAlgorithmOid)) {
    if (issuer.subjectPublicKeyAlgorithmOid !== RSA_ENCRYPTION_OID) {
      throw new TypeError("RSA certificate signature requires an rsaEncryption issuer public key.");
    }
    if (issuer.subjectPublicKeyParameters !== null && !isDerNull(issuer.subjectPublicKeyParameters)) {
      throw new TypeError("Unexpected rsaEncryption SubjectPublicKeyInfo parameters.");
    }
    if (certificate.signatureAlgorithmParameters !== null && !isDerNull(certificate.signatureAlgorithmParameters)) {
      throw new TypeError("Unexpected RSA signature AlgorithmIdentifier parameters.");
    }
    keyAlgorithm = { name: "RSASSA-PKCS1-v1_5", hash: digest };
    verifyAlgorithm = { name: "RSASSA-PKCS1-v1_5" };
  } else {
    if (issuer.subjectPublicKeyAlgorithmOid !== EC_PUBLIC_KEY_OID) {
      throw new TypeError("ECDSA certificate signature requires an id-ecPublicKey issuer.");
    }
    if (certificate.signatureAlgorithmParameters !== null) {
      throw new TypeError("ECDSA signature AlgorithmIdentifier parameters must be absent.");
    }
    if (!issuer.subjectPublicKeyParameters) throw new TypeError("EC issuer is missing named-curve parameters.");
    const curveElement = parseDer(issuer.subjectPublicKeyParameters, { maxInputBytes: 64, maxDepth: 2, maxNodes: 2 });
    const curveOid = decodeOid(curveElement);
    const curve = EC_CURVES[curveOid];
    if (!curve) throw new TypeError(`Unsupported EC named curve OID: ${curveOid}`);
    keyAlgorithm = { name: "ECDSA", namedCurve: curve.name };
    verifyAlgorithm = { name: "ECDSA", hash: digest };
    signature = ecdsaDerToP1363(signature, curve.width);
  }

  const key = await crypto.subtle.importKey(
    "spki",
    issuer.subjectPublicKeyInfo,
    keyAlgorithm,
    false,
    ["verify"],
  );
  return await crypto.subtle.verify(verifyAlgorithm, key, signature, certificate.tbsCertificate);
}
