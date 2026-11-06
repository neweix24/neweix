import { parseAndroidProvisioningInfo } from "./supreme-android-provisioning-info.ts";

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`);
  }
}
function assertThrows(fn: () => unknown): void {
  let threw = false;
  try { fn(); } catch { threw = true; }
  if (!threw) throw new Error("Expected function to throw.");
}

Deno.test("parses the upstream minimal provisioning map", () => {
  assertEquals(parseAndroidProvisioningInfo(new Uint8Array([0xa1, 0x01, 0x18, 0x2a])), {
    certificatesIssued: 42,
  });
});

Deno.test("matches upstream clamping for negative and oversized Int values", () => {
  assertEquals(parseAndroidProvisioningInfo(new Uint8Array([0xa1, 0x01, 0x20])), {
    certificatesIssued: 0,
  });
  assertEquals(parseAndroidProvisioningInfo(new Uint8Array([
    0xa1, 0x01, 0x1a, 0x80, 0x00, 0x00, 0x00,
  ])), { certificatesIssued: 2147483647 });
});

Deno.test("ignores additional CBOR fields as the upstream schema does", () => {
  assertEquals(parseAndroidProvisioningInfo(new Uint8Array([
    0xa3, 0x01, 0x01, 0x04, 0x63, 0x54, 0x45, 0x45, 0x06, 0xf5,
  ])), { certificatesIssued: 1 });
});

Deno.test("ignores non-integer future map keys", () => {
  assertEquals(parseAndroidProvisioningInfo(new Uint8Array([
    0xa2, 0x01, 0x03, 0x61, 0x78, 0x18, 0x2a,
  ])), { certificatesIssued: 3 });
});

Deno.test("rejects missing, duplicate and wrong-typed required fields", () => {
  assertThrows(() => parseAndroidProvisioningInfo(new Uint8Array([0xa0])));
  assertThrows(() => parseAndroidProvisioningInfo(new Uint8Array([0xa1, 0x02, 0x00])));
  assertThrows(() => parseAndroidProvisioningInfo(new Uint8Array([
    0xa2, 0x01, 0x01, 0x01, 0x02,
  ])));
  assertThrows(() => parseAndroidProvisioningInfo(new Uint8Array([
    0xa1, 0x01, 0x61, 0x78,
  ])));
});

Deno.test("rejects indefinite, non-canonical, truncated and trailing CBOR", () => {
  assertThrows(() => parseAndroidProvisioningInfo(new Uint8Array([0xbf, 0xff])));
  assertThrows(() => parseAndroidProvisioningInfo(new Uint8Array([0xa1, 0x01, 0x18, 0x01])));
  assertThrows(() => parseAndroidProvisioningInfo(new Uint8Array([0xa1, 0x01, 0x1a, 0x00])));
  assertThrows(() => parseAndroidProvisioningInfo(new Uint8Array([0xa1, 0x01, 0x00, 0x00])));
});

Deno.test("accepts bounded unknown nested fields and floating-point values", () => {
  assertEquals(parseAndroidProvisioningInfo(new Uint8Array([
    0xa2, 0x01, 0x02, 0x07, 0x82, 0x01, 0xfa, 0x3f, 0x80, 0x00, 0x00,
  ])), { certificatesIssued: 2 });
});

Deno.test("enforces nesting, node and input budgets", () => {
  assertThrows(() => parseAndroidProvisioningInfo(new Uint8Array([
    0xa2, 0x01, 0x01, 0x07, 0x81, 0x81, 0x81, 0x81, 0x81, 0x81, 0x81, 0x81, 0x81, 0x00,
  ])));
  assertThrows(() => parseAndroidProvisioningInfo(new Uint8Array(4097)));
});
