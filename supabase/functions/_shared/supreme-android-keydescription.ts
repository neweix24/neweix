import { DerElement, parseDer } from "./supreme-attestation-der.ts";
import {
  AttestationApplicationId,
  parseAttestationApplicationId,
} from "./supreme-attestation-application-id.ts";

export const ANDROID_KEY_ATTESTATION_OID = "1.3.6.1.4.1.11129.2.1.17";

export type AndroidAuthorizationEntry = {
  tagNumber: number;
  value: DerElement;
  attestationApplicationId?: AttestationApplicationId;
};

export type AndroidAuthorizationList = {
  entries: AndroidAuthorizationEntry[];
  tagsAreAscending: boolean;
};

export type AndroidKeyDescription = {
  attestationVersion: bigint;
  attestationSecurityLevel: number;
  keyMintVersion: bigint;
  keyMintSecurityLevel: number;
  attestationChallenge: Uint8Array;
  uniqueId: Uint8Array;
  softwareEnforced: AndroidAuthorizationList;
  hardwareEnforced: AndroidAuthorizationList;
};

const KNOWN_AUTHORIZATION_TAGS = new Set([
  1, 2, 3, 4, 5, 6, 10, 11, 200, 203, 400, 401, 402, 405,
  503, 504, 505, 507, 508, 509, 701, 702, 703, 704, 705, 706,
  709, 710, 711, 712, 713, 714, 715, 716, 717, 718, 719, 723, 724,
]);
const SET_OF_INTEGER_TAGS = new Set([1, 4, 5, 6, 203]);
const NULL_MARKER_TAGS = new Set([503, 507, 508, 509, 703]);
const OCTET_STRING_TAGS = new Set([709, 710, 711, 712, 713, 714, 715, 716, 717, 724]);

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
    throw new TypeError(`Invalid Android attestation ${label} encoding.`);
  }
}

function expectSequence(element: DerElement, label: string): DerElement[] {
  expectUniversal(element, 16, true, label);
  return element.children;
}

function expectOctetString(element: DerElement, label: string): Uint8Array {
  expectUniversal(element, 4, false, label);
  return element.value;
}

function expectInteger(element: DerElement, label: string): bigint {
  expectUniversal(element, 2, false, label);
  const bytes = element.value;
  if (bytes.length === 0) throw new TypeError(`Empty ${label} INTEGER.`);
  if (
    bytes.length > 1 &&
    ((bytes[0] === 0 && (bytes[1] & 0x80) === 0) ||
      (bytes[0] === 0xff && (bytes[1] & 0x80) !== 0))
  ) {
    throw new TypeError(`Non-canonical ${label} INTEGER.`);
  }
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  if ((bytes[0] & 0x80) !== 0) {
    value -= 1n << BigInt(bytes.length * 8);
  }
  return value;
}

function expectEnumerated(element: DerElement, label: string): number {
  expectUniversal(element, 10, false, label);
  const value = expectIntegerLike(element.value, label);
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError(`${label} ENUMERATED is out of range.`);
  }
  return Number(value);
}

function expectIntegerLike(bytes: Uint8Array, label: string): bigint {
  if (bytes.length === 0) throw new TypeError(`Empty ${label} ENUMERATED.`);
  if (
    bytes.length > 1 &&
    ((bytes[0] === 0 && (bytes[1] & 0x80) === 0) ||
      (bytes[0] === 0xff && (bytes[1] & 0x80) !== 0))
  ) {
    throw new TypeError(`Non-canonical ${label} ENUMERATED.`);
  }
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  if ((bytes[0] & 0x80) !== 0) value -= 1n << BigInt(bytes.length * 8);
  return value;
}

function parseAuthorizationList(element: DerElement, label: string): AndroidAuthorizationList {
  const fields = expectSequence(element, label);
  const entries: AndroidAuthorizationEntry[] = [];
  const seen = new Set<number>();
  let previousTag = -1;
  let tagsAreAscending = true;

  for (const field of fields) {
    if (field.tagClass !== "context" || !field.constructed) {
      throw new TypeError(`Invalid tagged field in Android ${label}.`);
    }
    if (!KNOWN_AUTHORIZATION_TAGS.has(field.tagNumber)) {
      throw new TypeError(`Unknown Android authorization tag ${field.tagNumber}.`);
    }
    if (seen.has(field.tagNumber)) {
      throw new TypeError(`Duplicate Android authorization tag ${field.tagNumber}.`);
    }
    seen.add(field.tagNumber);
    if (field.tagNumber <= previousTag) tagsAreAscending = false;
    previousTag = field.tagNumber;

    if (field.children.length !== 1) {
      throw new TypeError(`Android authorization tag ${field.tagNumber} must be EXPLICIT.`);
    }
    const value = field.children[0];

    if (SET_OF_INTEGER_TAGS.has(field.tagNumber)) {
      const values = expectSequenceLikeSet(value, field.tagNumber);
      for (const item of values) expectInteger(item, `authorization tag ${field.tagNumber} set item`);
    } else if (NULL_MARKER_TAGS.has(field.tagNumber)) {
      expectUniversal(value, 5, false, `authorization tag ${field.tagNumber} NULL marker`);
      if (value.value.length !== 0) {
        throw new TypeError(`Android authorization tag ${field.tagNumber} NULL marker must be empty.`);
      }
    } else if (field.tagNumber === 704) {
      parseRootOfTrust(value);
    } else if (field.tagNumber === 709) {
      const encodedApplicationId = expectOctetString(value, "attestation application ID");
      entries.push({
        tagNumber: field.tagNumber,
        value,
        attestationApplicationId: parseAttestationApplicationId(encodedApplicationId),
      });
      continue;
    } else if (OCTET_STRING_TAGS.has(field.tagNumber)) {
      expectOctetString(value, `authorization tag ${field.tagNumber}`);
    } else {
      expectInteger(value, `authorization tag ${field.tagNumber}`);
    }
    entries.push({ tagNumber: field.tagNumber, value });
  }

  return { entries, tagsAreAscending };
}

function expectSequenceLikeSet(element: DerElement, tagNumber: number): DerElement[] {
  // ASN.1 SET OF uses universal tag 17. DER parser retains its exact tag.
  expectUniversal(element, 17, true, `authorization tag ${tagNumber} SET OF`);
  return element.children;
}

function parseRootOfTrust(element: DerElement): void {
  const fields = expectSequence(element, "RootOfTrust");
  if (fields.length !== 3 && fields.length !== 4) {
    throw new TypeError("RootOfTrust must contain three or four fields.");
  }
  expectOctetString(fields[0], "RootOfTrust.verifiedBootKey");
  expectUniversal(fields[1], 1, false, "RootOfTrust.deviceLocked");
  if (
    fields[1].value.length !== 1 ||
    (fields[1].value[0] !== 0x00 && fields[1].value[0] !== 0xff)
  ) {
    throw new TypeError("RootOfTrust.deviceLocked must be a canonical DER BOOLEAN.");
  }
  const bootState = expectEnumerated(fields[2], "RootOfTrust.verifiedBootState");
  if (bootState < 0 || bootState > 3) {
    throw new TypeError("RootOfTrust has an unknown verified boot state.");
  }
  if (fields.length === 4) expectOctetString(fields[3], "RootOfTrust.verifiedBootHash");
}

/**
 * Decode the inner DER KeyDescription value from Android extension OID
 * 1.3.6.1.4.1.11129.2.1.17.
 *
 * This validates the top-level KeyDescription and AuthorizationList ASN.1
 * structure only. It does not validate certificates, trust paths, app IDs,
 * challenge policy, hardware security levels, or grant authentication.
 */
export function parseAndroidKeyDescription(input: Uint8Array): AndroidKeyDescription {
  const root = parseDer(input, { maxInputBytes: 64 * 1024, maxDepth: 20, maxNodes: 4096 });
  const fields = expectSequence(root, "KeyDescription");
  if (fields.length !== 8) {
    throw new TypeError("Android KeyDescription must contain exactly eight fields.");
  }

  const attestationVersion = expectInteger(fields[0], "attestationVersion");
  const attestationSecurityLevel = expectEnumerated(fields[1], "attestationSecurityLevel");
  const keyMintVersion = expectInteger(fields[2], "keyMintVersion");
  const keyMintSecurityLevel = expectEnumerated(fields[3], "keyMintSecurityLevel");
  if (attestationVersion < 0n || keyMintVersion < 0n) {
    throw new TypeError("Android attestation versions must be non-negative.");
  }
  if (![0, 1, 2].includes(attestationSecurityLevel) || ![0, 1, 2].includes(keyMintSecurityLevel)) {
    throw new TypeError("Android attestation contains an unknown security level.");
  }

  return {
    attestationVersion,
    attestationSecurityLevel,
    keyMintVersion,
    keyMintSecurityLevel,
    attestationChallenge: expectOctetString(fields[4], "attestationChallenge"),
    uniqueId: expectOctetString(fields[5], "uniqueId"),
    softwareEnforced: parseAuthorizationList(fields[6], "softwareEnforced AuthorizationList"),
    hardwareEnforced: parseAuthorizationList(fields[7], "hardwareEnforced AuthorizationList"),
  };
}
