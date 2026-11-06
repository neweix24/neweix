import {
  matchesAttestationApplicationId,
  type AttestationApplicationId,
} from "./supreme-attestation-application-id.ts";
import type {
  AndroidAuthorizationEntry,
  AndroidAuthorizationList,
  AndroidKeyDescription,
} from "./supreme-android-keydescription.ts";

export const SUPREME_ANDROID_PACKAGE_NAME = "com.neweix.supreme";

const KEYMINT_ALGORITHM_EC = 3n;
const KEYMINT_KEY_SIZE_P256 = 256n;
const KEYMINT_PURPOSE_SIGN = 2n;
const KEYMINT_PURPOSE_VERIFY = 3n;
const KEYMINT_DIGEST_SHA256 = 4n;
const KEYMINT_EC_CURVE_P256 = 1n;
const KEYMINT_ORIGIN_GENERATED = 0n;
const SECURITY_LEVEL_TRUSTED_ENVIRONMENT = 1;
const SECURITY_LEVEL_STRONG_BOX = 2;
const ROOT_OF_TRUST_VERIFIED = 0n;

export type SupremeAndroidKeyPolicy = {
  /** The exact 32-byte server challenge embedded by Android Keystore. */
  expectedChallenge: Uint8Array;
  /** Minimum versionCode allowed for the app identity in the attestation. */
  minimumPackageVersion: bigint;
  /** SHA-256 of the production APK signing certificate; never a debug signer. */
  signingCertificateSha256: Uint8Array;
};

export type SupremeAndroidKeyPolicyResult = {
  packageName: typeof SUPREME_ANDROID_PACKAGE_NAME;
  minimumPackageVersion: bigint;
  securityLevel: "TRUSTED_ENVIRONMENT" | "STRONG_BOX";
  keyAlgorithm: "EC";
  keySizeBits: 256;
  curve: "P-256";
  origin: "GENERATED";
  purpose: "SIGN_AND_VERIFY";
  digest: "SHA-256";
  deviceLocked: true;
  verifiedBootState: "VERIFIED";
};

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) difference |= left[index] ^ right[index];
  return difference === 0;
}

function findRequiredEntry(
  list: AndroidAuthorizationList,
  tagNumber: number,
  label: string,
): AndroidAuthorizationEntry {
  const entry = list.entries.find((item) => item.tagNumber === tagNumber);
  if (!entry) throw new TypeError(`Missing hardware-enforced Android ${label} tag ${tagNumber}.`);
  return entry;
}

function readPositiveInteger(entry: AndroidAuthorizationEntry, label: string): bigint {
  const element = entry.value;
  if (
    element.tagClass !== "universal" || element.tagNumber !== 2 ||
    element.constructed || element.value.length === 0 ||
    (element.value[0] & 0x80) !== 0
  ) {
    throw new TypeError(`Android ${label} must be a non-negative DER INTEGER.`);
  }
  if (
    element.value.length > 1 && element.value[0] === 0 &&
    (element.value[1] & 0x80) === 0
  ) {
    throw new TypeError(`Android ${label} INTEGER is not canonically encoded.`);
  }
  let value = 0n;
  for (const byte of element.value) value = (value << 8n) | BigInt(byte);
  return value;
}

function requireIntegerTag(
  list: AndroidAuthorizationList,
  tagNumber: number,
  expected: bigint,
  label: string,
): void {
  const actual = readPositiveInteger(
    findRequiredEntry(list, tagNumber, label),
    label,
  );
  if (actual !== expected) {
    throw new TypeError(`Android hardware-enforced ${label} does not meet Supreme policy.`);
  }
}

function requireSetMember(
  list: AndroidAuthorizationList,
  tagNumber: number,
  expected: bigint,
  label: string,
): void {
  const entry = findRequiredEntry(list, tagNumber, label);
  const set = entry.value;
  if (
    set.tagClass !== "universal" || set.tagNumber !== 17 ||
    !set.constructed
  ) {
    throw new TypeError(`Android hardware-enforced ${label} must be a DER SET OF INTEGER.`);
  }
  const values = set.children.map((child) => {
    if (
      child.tagClass !== "universal" || child.tagNumber !== 2 ||
      child.constructed || child.value.length === 0 ||
      (child.value[0] & 0x80) !== 0
    ) {
      throw new TypeError(`Android hardware-enforced ${label} contains an invalid INTEGER.`);
    }
    if (
      child.value.length > 1 && child.value[0] === 0 &&
      (child.value[1] & 0x80) === 0
    ) {
      throw new TypeError(`Android hardware-enforced ${label} contains a non-canonical INTEGER.`);
    }
    let value = 0n;
    for (const byte of child.value) value = (value << 8n) | BigInt(byte);
    return value;
  });
  if (!values.includes(expected)) {
    throw new TypeError(`Android hardware-enforced ${label} does not include the required value.`);
  }
}

function validateHardwareRootOfTrust(
  software: AndroidAuthorizationList,
  hardware: AndroidAuthorizationList,
): void {
  if (software.entries.some((entry) => entry.tagNumber === 704)) {
    throw new TypeError("RootOfTrust must be hardware-enforced, not software-enforced.");
  }
  const entry = findRequiredEntry(hardware, 704, "RootOfTrust");
  const root = entry.value;
  if (
    root.tagClass !== "universal" || root.tagNumber !== 16 ||
    !root.constructed || (root.children.length !== 3 && root.children.length !== 4)
  ) {
    throw new TypeError("Android RootOfTrust must contain three or four fields.");
  }

  const [verifiedBootKey, deviceLocked, verifiedBootState, verifiedBootHash] = root.children;
  if (
    verifiedBootKey.tagClass !== "universal" || verifiedBootKey.tagNumber !== 4 ||
    verifiedBootKey.constructed || verifiedBootKey.value.length === 0
  ) {
    throw new TypeError("Android RootOfTrust verifiedBootKey is missing or malformed.");
  }
  if (
    deviceLocked.tagClass !== "universal" || deviceLocked.tagNumber !== 1 ||
    deviceLocked.constructed || deviceLocked.value.length !== 1
  ) {
    throw new TypeError("Android RootOfTrust deviceLocked must be a DER BOOLEAN.");
  }
  if (deviceLocked.value[0] !== 0xff) {
    throw new TypeError("Android device bootloader must be locked.");
  }
  if (
    verifiedBootState.tagClass !== "universal" ||
    verifiedBootState.tagNumber !== 10 || verifiedBootState.constructed ||
    verifiedBootState.value.length === 0
  ) {
    throw new TypeError("Android RootOfTrust verifiedBootState must be ENUMERATED.");
  }
  let bootState = 0n;
  for (const byte of verifiedBootState.value) bootState = (bootState << 8n) | BigInt(byte);
  if (bootState !== ROOT_OF_TRUST_VERIFIED) {
    throw new TypeError("Android device must report VERIFIED boot state.");
  }
  if (verifiedBootHash && (
    verifiedBootHash.tagClass !== "universal" ||
    verifiedBootHash.tagNumber !== 4 ||
    verifiedBootHash.constructed
  )) {
    throw new TypeError("Android RootOfTrust verifiedBootHash must be an OCTET STRING.");
  }
}

function validateAppIdentity(
  description: AndroidKeyDescription,
  policy: SupremeAndroidKeyPolicy,
): void {
  if (
    policy.expectedChallenge.length !== 32 ||
    policy.signingCertificateSha256.length !== 32 ||
    policy.signingCertificateSha256.every((byte) => byte === 0) ||
    policy.minimumPackageVersion < 1n
  ) {
    throw new TypeError("Supreme Android package, challenge, version or production signer policy is not configured safely.");
  }
  if (!equalBytes(description.attestationChallenge, policy.expectedChallenge)) {
    throw new TypeError("Android KeyDescription challenge does not match the server challenge.");
  }

  if (description.hardwareEnforced.entries.some((entry) => entry.tagNumber === 709)) {
    throw new TypeError("AttestationApplicationId must be software-enforced as defined by Android.");
  }
  const applicationIdEntry = description.softwareEnforced.entries.find((entry) =>
    entry.tagNumber === 709
  );
  const applicationId: AttestationApplicationId | undefined =
    applicationIdEntry?.attestationApplicationId;
  if (!applicationId) {
    throw new TypeError("Android attestation is missing software-enforced AttestationApplicationId.");
  }
  if (!matchesAttestationApplicationId(applicationId, {
    packageName: SUPREME_ANDROID_PACKAGE_NAME,
    minimumVersion: policy.minimumPackageVersion,
    signingCertificateSha256: policy.signingCertificateSha256,
  })) {
    throw new TypeError("Android package name, minimum version or production signing certificate does not match Supreme.");
  }
}

function validateHardwareKey(description: AndroidKeyDescription): "TRUSTED_ENVIRONMENT" | "STRONG_BOX" {
  const securityLevel = description.attestationSecurityLevel;
  if (
    securityLevel !== description.keyMintSecurityLevel ||
    (securityLevel !== SECURITY_LEVEL_TRUSTED_ENVIRONMENT &&
      securityLevel !== SECURITY_LEVEL_STRONG_BOX)
  ) {
    throw new TypeError("Supreme requires matching TEE or StrongBox attestation and KeyMint security levels.");
  }

  const hardware = description.hardwareEnforced;
  if (description.softwareEnforced.entries.some((entry) =>
    entry.tagNumber === 702 || entry.tagNumber === 704
  )) {
    throw new TypeError("Key origin and RootOfTrust must not be software-enforced.");
  }

  requireIntegerTag(hardware, 2, KEYMINT_ALGORITHM_EC, "key algorithm");
  requireIntegerTag(hardware, 3, KEYMINT_KEY_SIZE_P256, "key size");
  requireSetMember(hardware, 1, KEYMINT_PURPOSE_SIGN, "key purpose");
  requireSetMember(hardware, 1, KEYMINT_PURPOSE_VERIFY, "key purpose");
  requireSetMember(hardware, 5, KEYMINT_DIGEST_SHA256, "key digest");
  requireIntegerTag(hardware, 10, KEYMINT_EC_CURVE_P256, "EC curve");
  requireIntegerTag(hardware, 702, KEYMINT_ORIGIN_GENERATED, "key origin");

  validateHardwareRootOfTrust(description.softwareEnforced, hardware);
  return securityLevel === SECURITY_LEVEL_STRONG_BOX
    ? "STRONG_BOX"
    : "TRUSTED_ENVIRONMENT";
}

/**
 * Apply the NEWEIX Supreme device policy to a decoded Android KeyDescription.
 *
 * This requires the caller to supply the current server challenge, a configured
 * production APK signing-certificate SHA-256 digest, and a minimum app version.
 * It accepts only com.neweix.supreme, hardware-generated P-256 signing keys,
 * matching TEE/StrongBox levels, and a locked device with VERIFIED boot.
 *
 * This function does not validate the X.509 path, Google revocation status,
 * certificate-to-app extension binding, proof-of-possession, password, MFA,
 * Supabase roles or session creation. It is not an authentication endpoint.
 */
export function validateSupremeAndroidKeyDescription(
  description: AndroidKeyDescription,
  policy: SupremeAndroidKeyPolicy,
): SupremeAndroidKeyPolicyResult {
  validateAppIdentity(description, policy);
  const securityLevel = validateHardwareKey(description);
  return {
    packageName: SUPREME_ANDROID_PACKAGE_NAME,
    minimumPackageVersion: policy.minimumPackageVersion,
    securityLevel,
    keyAlgorithm: "EC",
    keySizeBits: 256,
    curve: "P-256",
    origin: "GENERATED",
    purpose: "SIGN_AND_VERIFY",
    digest: "SHA-256",
    deviceLocked: true,
    verifiedBootState: "VERIFIED",
  };
}
