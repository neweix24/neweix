import {
  matchesAttestationApplicationId,
  parseAttestationApplicationId,
} from "./supreme-attestation-application-id.ts";

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
function tlv(tag: number, value: number[]): number[] {
  return [tag, ...lengthBytes(value.length), ...value];
}
function seq(...items: number[][]): number[] {
  return tlv(0x30, items.flat());
}
function setOf(...items: number[][]): number[] {
  return tlv(0x31, items.flat());
}
function octets(value: number[]): number[] {
  return tlv(0x04, value);
}
function integer(value: number): number[] {
  const bytes = value < 128 ? [value] : [0, value];
  return tlv(0x02, bytes);
}
function packageInfo(name: string, version: number): number[] {
  return seq(octets([...new TextEncoder().encode(name)]), integer(version));
}
function appId(
  packages: number[][],
  signatures: number[][],
): Uint8Array {
  return new Uint8Array(seq(setOf(...packages), setOf(...signatures)));
}
function throws(fn: () => unknown, label: string): void {
  let rejected = false;
  try { fn(); } catch { rejected = true; }
  if (!rejected) throw new Error(`Expected rejection: ${label}`);
}
const signer = Array.from({ length: 32 }, (_, index) => index + 1);

Deno.test("AttestationApplicationId parses DER package SET and SHA-256 signer SET", () => {
  const decoded = parseAttestationApplicationId(appId(
    [packageInfo("com.neweix.supreme", 12)],
    [octets(signer)],
  ));
  if (
    decoded.packages.length !== 1 ||
    decoded.packages[0].packageName !== "com.neweix.supreme" ||
    decoded.packages[0].version !== 12n ||
    decoded.signatureDigests.length !== 1 ||
    decoded.signatureDigests[0].length !== 32
  ) throw new Error("Unexpected AttestationApplicationId contents.");
});

Deno.test("AttestationApplicationId matches exact package, minimum version and signer digest", () => {
  const decoded = parseAttestationApplicationId(appId(
    [packageInfo("com.neweix.supreme", 12)],
    [octets(signer)],
  ));
  if (!matchesAttestationApplicationId(decoded, {
    packageName: "com.neweix.supreme",
    minimumVersion: 10n,
    signingCertificateSha256: new Uint8Array(signer),
  })) throw new Error("Expected package and signer to match.");
  if (matchesAttestationApplicationId(decoded, {
    packageName: "com.neweix.supreme",
    minimumVersion: 13n,
    signingCertificateSha256: new Uint8Array(signer),
  })) throw new Error("Older package version must not match.");
  if (matchesAttestationApplicationId(decoded, {
    packageName: "com.neweix.other",
    minimumVersion: 1n,
    signingCertificateSha256: new Uint8Array(signer),
  })) throw new Error("Wrong package must not match.");
  const wrongSigner = signer.slice();
  wrongSigner[0] ^= 0xff;
  if (matchesAttestationApplicationId(decoded, {
    packageName: "com.neweix.supreme",
    minimumVersion: 1n,
    signingCertificateSha256: new Uint8Array(wrongSigner),
  })) throw new Error("Wrong signer must not match.");
});

Deno.test("AttestationApplicationId rejects wrong envelope and package field shapes", () => {
  throws(() => parseAttestationApplicationId(new Uint8Array(seq(setOf(), setOf(), integer(1)))), "extra top-level field");
  throws(() => parseAttestationApplicationId(new Uint8Array(seq(setOf(integer(1)), setOf()))), "package must be sequence");
  throws(() => parseAttestationApplicationId(new Uint8Array(seq(
    setOf(seq(octets([0x61]), integer(1), integer(2))), setOf(),
  ))), "package info field count");
});

Deno.test("AttestationApplicationId rejects malformed UTF-8 and empty package names", () => {
  throws(() => parseAttestationApplicationId(appId(
    [seq(octets([0xc3, 0x28]), integer(1))], [],
  )), "malformed UTF-8");
  throws(() => parseAttestationApplicationId(appId(
    [seq(octets([]), integer(1))], [],
  )), "empty package");
});

Deno.test("AttestationApplicationId rejects duplicate package names and signer digests", () => {
  throws(() => parseAttestationApplicationId(appId([
    packageInfo("com.neweix.supreme", 1),
    packageInfo("com.neweix.supreme", 2),
  ], [])), "duplicate package");
  throws(() => parseAttestationApplicationId(appId([], [
    octets(signer), octets(signer),
  ])), "duplicate signer digest");
});

Deno.test("AttestationApplicationId rejects negative, non-canonical and oversized versions", () => {
  throws(() => parseAttestationApplicationId(appId([
    seq(octets([0x61]), tlv(0x02, [0xff])),
  ], [])), "negative version");
  throws(() => parseAttestationApplicationId(appId([
    seq(octets([0x61]), tlv(0x02, [0x00, 0x01])),
  ], [])), "non-canonical version");
  throws(() => parseAttestationApplicationId(appId([
    seq(octets([0x61]), tlv(0x02, [0x00, 0x80, 0x00, 0x00, 0x00])),
  ], [])), "oversized version");
});

Deno.test("AttestationApplicationId requires 32-byte SHA-256 signer digests", () => {
  throws(() => parseAttestationApplicationId(appId([], [octets([1, 2, 3])])), "wrong digest length");
});
