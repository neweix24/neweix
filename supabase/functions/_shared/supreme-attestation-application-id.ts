import { DerElement, parseDer } from "./supreme-attestation-der.ts";

export type AttestationPackageInfo = {
  packageName: string;
  version: bigint;
};

export type AttestationApplicationId = {
  packages: AttestationPackageInfo[];
  signatureDigests: Uint8Array[];
};

const MAX_PACKAGES = 32;
const MAX_SIGNATURES = 10;
const MAX_DER_BYTES = 16 * 1024;

function expectUniversal(
  element: DerElement,
  tagNumber: number,
  constructed: boolean,
  label: string,
): void {
  if (
    element.tagClass !== "universal" ||
    element.tagNumber !== tagNumber ||
    element.constructed !== constructed
  ) {
    throw new TypeError(`Invalid AttestationApplicationId ${label} encoding.`);
  }
}

function expectSequence(element: DerElement, label: string): DerElement[] {
  expectUniversal(element, 16, true, label);
  return element.children;
}

function expectSet(element: DerElement, label: string): DerElement[] {
  expectUniversal(element, 17, true, label);
  return element.children;
}

function expectOctets(element: DerElement, label: string): Uint8Array {
  expectUniversal(element, 4, false, label);
  return element.value;
}

function expectVersion(element: DerElement): bigint {
  expectUniversal(element, 2, false, "package version");
  const bytes = element.value;
  if (bytes.length === 0 || (bytes[0] & 0x80) !== 0) {
    throw new TypeError("Package version must be a non-negative DER INTEGER.");
  }
  if (
    bytes.length > 1 &&
    bytes[0] === 0 &&
    (bytes[1] & 0x80) === 0
  ) {
    throw new TypeError("Package version INTEGER is not canonically encoded.");
  }
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  return value;
}

/**
 * Decode the DER-encoded AttestationApplicationId carried inside the
 * AuthorizationList ATTESTATION_APPLICATION_ID OCTET STRING (tag 709).
 *
 * The payload is ASN.1 DER, not CBOR. This parser only decodes the app ID;
 * it does not establish certificate trust or authenticate a package.
 */
export function parseAttestationApplicationId(
  input: Uint8Array,
): AttestationApplicationId {
  const root = parseDer(input, {
    maxInputBytes: MAX_DER_BYTES,
    maxDepth: 12,
    maxNodes: 512,
  });
  const fields = expectSequence(root, "top-level sequence");
  if (fields.length !== 2) {
    throw new TypeError("AttestationApplicationId must contain exactly two fields.");
  }

  const packageElements = expectSet(fields[0], "package SET OF");
  const signatureElements = expectSet(fields[1], "signature SET OF");
  if (packageElements.length > MAX_PACKAGES) {
    throw new RangeError("AttestationApplicationId contains too many packages.");
  }
  if (signatureElements.length > MAX_SIGNATURES) {
    throw new RangeError("AttestationApplicationId contains too many signatures.");
  }

  const decoder = new TextDecoder("utf-8", { fatal: true });
  const packageNames = new Set<string>();
  const packages = packageElements.map((element) => {
    const packageFields = expectSequence(element, "package info sequence");
    if (packageFields.length !== 2) {
      throw new TypeError("AttestationPackageInfo must contain exactly two fields.");
    }
    const nameBytes = expectOctets(packageFields[0], "package name");
    if (nameBytes.length === 0 || nameBytes.length > 255) {
      throw new TypeError("Package name length is outside the allowed range.");
    }
    const packageName = decoder.decode(nameBytes);
    if (packageName.length === 0 || packageNames.has(packageName)) {
      throw new TypeError("AttestationApplicationId contains an empty or duplicate package name.");
    }
    packageNames.add(packageName);
    return { packageName, version: expectVersion(packageFields[1]) };
  });

  const digestSet = new Set<string>();
  const signatureDigests = signatureElements.map((element) => {
    const digest = expectOctets(element, "signature digest");
    const key = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
    if (digestSet.has(key)) {
      throw new TypeError("AttestationApplicationId contains a duplicate signature digest.");
    }
    digestSet.add(key);
    return digest;
  });

  return { packages, signatureDigests };
}

/** Match the exact package and signer digest expected by the server policy. */
export function matchesAttestationApplicationId(
  actual: AttestationApplicationId,
  expected: {
    packageName: string;
    minimumVersion: bigint;
    signingCertificateSha256: Uint8Array;
  },
): boolean {
  if (
    expected.packageName.length === 0 ||
    expected.minimumVersion < 0n ||
    expected.signingCertificateSha256.length !== 32
  ) return false;

  const packageMatches = actual.packages.some((item) =>
    item.packageName === expected.packageName &&
    item.version >= expected.minimumVersion
  );
  if (!packageMatches) return false;

  return actual.signatureDigests.some((digest) =>
    digest.length === 32 &&
    digest.length === expected.signingCertificateSha256.length &&
    digest.every((byte, index) => byte === expected.signingCertificateSha256[index])
  );
}
