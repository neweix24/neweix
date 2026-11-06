const PROOF_DOMAIN = "NEWEIX-SUPREME-ATTESTATION-V1";
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const BASE64URL_32_BYTES = /^[A-Za-z0-9_-]{43}$/;

function toArrayBuffer(value: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
}

/**
 * Strictly decodes the unpadded base64url representation used by the Android
 * app. Re-encoding prevents accepting alternate/non-canonical encodings.
 */
export function decodeSupremeChallenge(value: unknown): Uint8Array {
  if (typeof value !== "string" || !BASE64URL_32_BYTES.test(value)) {
    throw new TypeError("Invalid attestation challenge encoding.");
  }

  const base64 = value.replaceAll("-", "+").replaceAll("_", "/") + "=";
  let binary: string;
  try {
    binary = atob(base64);
  } catch {
    throw new TypeError("Invalid attestation challenge encoding.");
  }

  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  if (bytes.length !== 32 || encodeSupremeChallenge(bytes) !== value) {
    throw new TypeError("Invalid attestation challenge encoding.");
  }
  return bytes;
}

export function encodeSupremeChallenge(challenge: Uint8Array): string {
  if (challenge.length !== 32) {
    throw new TypeError("Attestation challenge must be exactly 32 bytes.");
  }
  let binary = "";
  for (const byte of challenge) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

export function buildSupremeProofPayload(
  challengeId: unknown,
  challenge: Uint8Array,
): Uint8Array {
  if (typeof challengeId !== "string" || !UUID_V4.test(challengeId)) {
    throw new TypeError("Invalid attestation challenge ID.");
  }
  const challengeEncoded = encodeSupremeChallenge(challenge);
  return new TextEncoder().encode(
    `${PROOF_DOMAIN}\n${challengeId}\n${challengeEncoded}`,
  );
}

/**
 * Android Signature("SHA256withECDSA") returns an ASN.1 DER ECDSA signature.
 * WebCrypto ECDSA verification expects the fixed-width IEEE-P1363 r||s form.
 * Convert strictly and reject non-canonical DER before passing it to WebCrypto.
 */
export function decodeEcdsaDerSignature(
  der: Uint8Array,
  coordinateSize = 32,
): Uint8Array {
  if (coordinateSize < 1 || coordinateSize > 66) {
    throw new RangeError("Unsupported ECDSA coordinate size.");
  }

  let offset = 0;
  const readLength = (): number => {
    if (offset >= der.length) throw new TypeError("Truncated DER signature.");
    const first = der[offset++];
    if (first < 0x80) return first;
    const count = first & 0x7f;
    if (count === 0 || count > 2 || offset + count > der.length) {
      throw new TypeError("Invalid DER length.");
    }
    if (der[offset] === 0) throw new TypeError("Non-canonical DER length.");
    let length = 0;
    for (let index = 0; index < count; index++) {
      length = (length << 8) | der[offset++];
    }
    if (length < 0x80) throw new TypeError("Non-canonical DER length.");
    return length;
  };

  if (der[offset++] !== 0x30) throw new TypeError("Expected DER sequence.");
  const sequenceLength = readLength();
  const sequenceEnd = offset + sequenceLength;
  if (sequenceEnd !== der.length) throw new TypeError("Invalid DER sequence length.");

  const readInteger = (): Uint8Array => {
    if (der[offset++] !== 0x02) throw new TypeError("Expected DER integer.");
    const length = readLength();
    if (length < 1 || offset + length > sequenceEnd) {
      throw new TypeError("Invalid DER integer length.");
    }
    let integer = der.slice(offset, offset + length);
    offset += length;

    if ((integer[0] & 0x80) !== 0) {
      throw new TypeError("Negative ECDSA integer.");
    }
    if (integer.length > 1 && integer[0] === 0) {
      if ((integer[1] & 0x80) === 0) {
        throw new TypeError("Non-canonical DER integer.");
      }
      integer = integer.slice(1);
    }
    if (integer.length > coordinateSize) {
      throw new TypeError("ECDSA integer exceeds curve size.");
    }

    const padded = new Uint8Array(coordinateSize);
    padded.set(integer, coordinateSize - integer.length);
    return padded;
  };

  const r = readInteger();
  const s = readInteger();
  if (offset !== sequenceEnd) throw new TypeError("Trailing DER signature data.");

  const raw = new Uint8Array(coordinateSize * 2);
  raw.set(r, 0);
  raw.set(s, coordinateSize);
  return raw;
}

/**
 * Verifies proof-of-possession using a public key extracted from a certificate
 * chain that has already passed independent trust and attestation validation.
 * This function does NOT validate or trust certificates itself.
 */
export async function verifySupremeChallengeProof(
  publicKey: CryptoKey,
  challengeId: unknown,
  challenge: Uint8Array,
  derSignature: Uint8Array,
): Promise<boolean> {
  if (
    publicKey.type !== "public" ||
    publicKey.algorithm.name !== "ECDSA" ||
    (publicKey.algorithm as EcKeyAlgorithm).namedCurve !== "P-256" ||
    !publicKey.usages.includes("verify")
  ) {
    return false;
  }

  let payload: Uint8Array;
  let signature: Uint8Array;
  try {
    payload = buildSupremeProofPayload(challengeId, challenge);
    signature = decodeEcdsaDerSignature(derSignature, 32);
  } catch {
    return false;
  }

  try {
    return await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      publicKey,
      toArrayBuffer(signature),
      toArrayBuffer(payload),
    );
  } catch {
    return false;
  }
}
