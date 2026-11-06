import { parseAndroidKeyDescription } from "./supreme-android-keydescription.ts";
import {
  SUPREME_ANDROID_PACKAGE_NAME,
  validateSupremeAndroidKeyDescription,
  type SupremeAndroidKeyPolicy,
} from "./supreme-android-attestation-policy.ts";

function lengthBytes(length: number): number[] {
  if (length < 128) return [length];
  const bytes: number[] = [];
  let remaining = length;
  while (remaining > 0) {
    bytes.unshift(remaining & 0xff);
    remaining >>>= 8;
  }
  return [0x80 | bytes.length, ...bytes];
}
function tlv(tag: number[], value: number[]): number[] {
  return [...tag, ...lengthBytes(value.length), ...value];
}
function contextTag(tagNumber: number, value: number[]): number[] {
  if (tagNumber <= 30) return tlv([0xa0 | tagNumber], value);
  const encoded: number[] = [];
  let remaining = tagNumber;
  encoded.unshift(remaining & 0x7f);
  remaining >>>= 7;
  while (remaining > 0) {
    encoded.unshift(0x80 | (remaining & 0x7f));
    remaining >>>= 7;
  }
  return tlv([0xbf, ...encoded], value);
}
function seq(...items: number[][]): number[] {
  return tlv([0x30], items.flat());
}
function setOf(...items: number[][]): number[] {
  return tlv([0x31], items.flat());
}
function integer(value: bigint): number[] {
  if (value < 0n) throw new Error("Test INTEGER must be non-negative.");
  const bytes: number[] = [];
  let remaining = value;
  do {
    bytes.unshift(Number(remaining & 0xffn));
    remaining >>= 8n;
  } while (remaining > 0n);
  if ((bytes[0] & 0x80) !== 0) bytes.unshift(0);
  return tlv([0x02], bytes);
}
function enumerated(value: number): number[] {
  return tlv([0x0a], [value]);
}
function octets(value: Uint8Array | number[]): number[] {
  return tlv([0x04], Array.from(value));
}
function boolean(value: boolean): number[] {
  return tlv([0x01], [value ? 0xff : 0x00]);
}
function packageInfo(name: string, version: bigint): number[] {
  return seq(octets(new TextEncoder().encode(name)), integer(version));
}
function applicationId(
  packageName: string,
  version: bigint,
  signerDigest: Uint8Array,
): number[] {
  return seq(
    setOf(packageInfo(packageName, version)),
    setOf(octets(signerDigest)),
  );
}

const challenge = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
const signingDigest = Uint8Array.from({ length: 32 }, (_, index) => 0xa0 + index);
const bootKey = Uint8Array.from({ length: 32 }, (_, index) => 0x40 + index);
const bootHash = Uint8Array.from({ length: 32 }, (_, index) => 0x70 + index);

type FixtureOptions = {
  packageName?: string;
  packageVersion?: bigint;
  signerDigest?: Uint8Array;
  challenge?: Uint8Array;
  attestationSecurityLevel?: number;
  keyMintSecurityLevel?: number;
  algorithm?: bigint;
  keySize?: bigint;
  purposes?: bigint[];
  digests?: bigint[];
  curve?: bigint;
  origin?: bigint;
  deviceLocked?: boolean;
  verifiedBootState?: number;
  rootOfTrustInSoftware?: boolean;
  applicationIdInHardware?: boolean;
  includeApplicationId?: boolean;
  minimumVersion?: bigint;
};

function makeDescription(options: FixtureOptions = {}) {
  const appId = applicationId(
    options.packageName ?? SUPREME_ANDROID_PACKAGE_NAME,
    options.packageVersion ?? 2n,
    options.signerDigest ?? signingDigest,
  );
  const appIdEntry = contextTag(709, octets(appId));
  const softwareEntries = options.applicationIdInHardware ? [] : [appIdEntry];
  const hardwareEntries: number[][] = [
    contextTag(1, setOf(...(options.purposes ?? [2n, 3n]).map(integer))),
    contextTag(2, integer(options.algorithm ?? 3n)),
    contextTag(3, integer(options.keySize ?? 256n)),
    contextTag(5, setOf(...(options.digests ?? [4n]).map(integer))),
    contextTag(10, integer(options.curve ?? 1n)),
    contextTag(702, integer(options.origin ?? 0n)),
    contextTag(704, seq(
      octets(bootKey),
      boolean(options.deviceLocked ?? true),
      enumerated(options.verifiedBootState ?? 0),
      octets(bootHash),
    )),
  ];
  if (options.rootOfTrustInSoftware) {
    const index = softwareEntries.length;
    softwareEntries.splice(index, 0, contextTag(704, seq(
      octets(bootKey), boolean(true), enumerated(0), octets(bootHash),
    )));
  }
  if (options.applicationIdInHardware) {
    hardwareEntries.push(appIdEntry);
    hardwareEntries.sort((left, right) => {
      // The input fixtures are generated in ascending tag order; tag 709 is last.
      return left.length - right.length;
    });
  }
  if (!options.includeApplicationId) softwareEntries.length = 0;

  const keyDescription = seq(
    integer(4n),
    enumerated(options.attestationSecurityLevel ?? 1),
    integer(4n),
    enumerated(options.keyMintSecurityLevel ?? options.attestationSecurityLevel ?? 1),
    octets(options.challenge ?? challenge),
    octets([]),
    seq(...softwareEntries),
    seq(...hardwareEntries),
  );
  return parseAndroidKeyDescription(new Uint8Array(keyDescription));
}

function policy(options: FixtureOptions = {}): SupremeAndroidKeyPolicy {
  const signer = options.signerDigest ?? signingDigest;
  return {
    expectedChallenge: options.challenge ?? challenge,
    minimumPackageVersion: options.minimumVersion ?? 2n,
    signingCertificateSha256: signer,
  };
}

function assertRejected(
  description: ReturnType<typeof makeDescription>,
  expectedPolicy: SupremeAndroidKeyPolicy,
  label: string,
): void {
  let rejected = false;
  try {
    validateSupremeAndroidKeyDescription(description, expectedPolicy);
  } catch {
    rejected = true;
  }
  if (!rejected) throw new Error(`Expected Supreme Android policy to reject: ${label}`);
}

Deno.test("Supreme Android policy accepts hardware-backed TEE and StrongBox app attestations", () => {
  for (const [level, expected] of [[1, "TRUSTED_ENVIRONMENT"], [2, "STRONG_BOX"]] as const) {
    const result = validateSupremeAndroidKeyDescription(
      makeDescription({ attestationSecurityLevel: level, keyMintSecurityLevel: level }),
      policy(),
    );
    if (
      result.packageName !== SUPREME_ANDROID_PACKAGE_NAME ||
      result.securityLevel !== expected ||
      result.deviceLocked !== true ||
      result.verifiedBootState !== "VERIFIED" ||
      result.origin !== "GENERATED" ||
      result.curve !== "P-256"
    ) {
      throw new Error("Supreme policy returned an unexpected hardware attestation result.");
    }
  }
});

Deno.test("Supreme Android policy rejects wrong package, old version and wrong production signer", () => {
  assertRejected(makeDescription({ packageName: "com.neweix.customer" }), policy(), "wrong package");
  assertRejected(makeDescription({ packageVersion: 1n }), policy(), "old app version");
  const wrongSigner = signingDigest.slice();
  wrongSigner[0] ^= 0xff;
  assertRejected(makeDescription(), { ...policy(), signingCertificateSha256: wrongSigner }, "wrong configured signer");
  assertRejected(makeDescription({ signerDigest: wrongSigner }), policy(), "wrong attested signer");
});

Deno.test("Supreme Android policy rejects missing app identity and app identity from the wrong enforcement list", () => {
  assertRejected(makeDescription({ includeApplicationId: false }), policy(), "missing app ID");
  assertRejected(makeDescription({ applicationIdInHardware: true }), policy(), "hardware-only app ID");
});

Deno.test("Supreme Android policy rejects challenge mismatch and incomplete policy configuration", () => {
  const wrongChallenge = challenge.slice();
  wrongChallenge[0] ^= 0xff;
  assertRejected(makeDescription({ challenge: wrongChallenge }), policy(), "wrong challenge");
  assertRejected(makeDescription(), { ...policy(), expectedChallenge: new Uint8Array(31) }, "short server challenge");
  assertRejected(makeDescription(), { ...policy(), signingCertificateSha256: new Uint8Array(31) }, "short signing digest");
  assertRejected(makeDescription(), { ...policy(), signingCertificateSha256: new Uint8Array(32) }, "unconfigured zero signer digest");
  assertRejected(makeDescription(), { ...policy(), minimumPackageVersion: 0n }, "invalid minimum version");
});

Deno.test("Supreme Android policy rejects software or mismatched security levels", () => {
  assertRejected(makeDescription({ attestationSecurityLevel: 0, keyMintSecurityLevel: 0 }), policy(), "software key");
  assertRejected(makeDescription({ attestationSecurityLevel: 1, keyMintSecurityLevel: 2 }), policy(), "mismatched security levels");
});

Deno.test("Supreme Android policy requires generated P-256 EC signing and SHA-256 verification key", () => {
  assertRejected(makeDescription({ algorithm: 1n }), policy(), "RSA key algorithm");
  assertRejected(makeDescription({ keySize: 384n }), policy(), "wrong key size");
  assertRejected(makeDescription({ curve: 2n }), policy(), "wrong curve");
  assertRejected(makeDescription({ origin: 2n }), policy(), "imported key origin");
  assertRejected(makeDescription({ purposes: [3n] }), policy(), "missing SIGN purpose");
  assertRejected(makeDescription({ purposes: [2n] }), policy(), "missing VERIFY purpose");
  assertRejected(makeDescription({ digests: [3n] }), policy(), "missing SHA-256 digest");
});

Deno.test("Supreme Android policy requires a hardware-enforced locked VERIFIED RootOfTrust", () => {
  assertRejected(makeDescription({ deviceLocked: false }), policy(), "unlocked bootloader");
  assertRejected(makeDescription({ verifiedBootState: 1 }), policy(), "self-signed boot");
  assertRejected(makeDescription({ verifiedBootState: 2 }), policy(), "unverified boot");
  assertRejected(makeDescription({ verifiedBootState: 3 }), policy(), "failed boot");
  assertRejected(makeDescription({ rootOfTrustInSoftware: true }), policy(), "software RootOfTrust");
});
