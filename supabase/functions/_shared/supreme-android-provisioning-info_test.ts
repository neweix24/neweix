import { assertEquals, assertThrows } from "jsr:@std/assert";
import { parseAndroidProvisioningInfo } from "./supreme-android-provisioning-info.ts";

Deno.test("parses required RKP provisioning fields", () => {
  assertEquals(
    parseAndroidProvisioningInfo(new Uint8Array([
      0xa2, 0x01, 0x18, 0x2a, 0x04, 0x63, 0x54, 0x45, 0x45,
    ])),
    { certificatesIssued: 42n, validatedAttestedEntity: "TEE" },
  );
});

Deno.test("parses StrongBox and an explicit lost-device false flag", () => {
  assertEquals(
    parseAndroidProvisioningInfo(new Uint8Array([
      0xa3, 0x01, 0x01, 0x04, 0x6a, 0x53, 0x54, 0x52, 0x4f,
      0x4e, 0x47, 0x5f, 0x42, 0x4f, 0x58, 0x06, 0xf4,
    ])),
    { certificatesIssued: 1n, validatedAttestedEntity: "STRONG_BOX", isLostDevice: false },
  );
});

Deno.test("parses an explicit lost-device true flag", () => {
  assertEquals(
    parseAndroidProvisioningInfo(new Uint8Array([
      0xa3, 0x01, 0x00, 0x04, 0x63, 0x54, 0x45, 0x45, 0x06, 0xf5,
    ])).isLostDevice,
    true,
  );
});

Deno.test("rejects missing required fields, duplicate keys and wrong types", () => {
  assertThrows(() => parseAndroidProvisioningInfo(new Uint8Array([0xa1, 0x01, 0x00])));
  assertThrows(() => parseAndroidProvisioningInfo(new Uint8Array([
    0xa3, 0x01, 0x01, 0x01, 0x02, 0x04, 0x63, 0x54, 0x45, 0x45,
  ])));
  assertThrows(() => parseAndroidProvisioningInfo(new Uint8Array([
    0xa2, 0x01, 0x61, 0x78, 0x04, 0x63, 0x54, 0x45, 0x45,
  ])));
  assertThrows(() => parseAndroidProvisioningInfo(new Uint8Array([
    0xa2, 0x01, 0x01, 0x04, 0x63, 0x58, 0x58, 0x58,
  ])));
  assertThrows(() => parseAndroidProvisioningInfo(new Uint8Array([
    0xa3, 0x01, 0x01, 0x04, 0x63, 0x54, 0x45, 0x45, 0x06, 0x00,
  ])));
});

Deno.test("rejects indefinite, non-canonical, truncated and trailing CBOR", () => {
  assertThrows(() => parseAndroidProvisioningInfo(new Uint8Array([0xbf, 0xff])));
  assertThrows(() => parseAndroidProvisioningInfo(new Uint8Array([
    0xa2, 0x01, 0x18, 0x01, 0x04, 0x63, 0x54, 0x45, 0x45,
  ])));
  assertThrows(() => parseAndroidProvisioningInfo(new Uint8Array([
    0xa2, 0x01, 0x01, 0x04, 0x63, 0x54,
  ])));
  assertThrows(() => parseAndroidProvisioningInfo(new Uint8Array([
    0xa2, 0x01, 0x01, 0x04, 0x63, 0x54, 0x45, 0x45, 0x00,
  ])));
});

Deno.test("accepts bounded unknown future fields without losing required policy fields", () => {
  assertEquals(
    parseAndroidProvisioningInfo(new Uint8Array([
      0xa3, 0x01, 0x02, 0x04, 0x63, 0x54, 0x45, 0x45, 0x07, 0x82, 0x01, 0x02,
    ])),
    { certificatesIssued: 2n, validatedAttestedEntity: "TEE" },
  );
});

Deno.test("rejects oversized input", () => {
  assertThrows(() => parseAndroidProvisioningInfo(new Uint8Array(4097)));
});
