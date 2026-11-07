import { parseAndroidKeyDescription } from "./supreme-android-keydescription.ts";

function tlv(tag: number[], value: number[]): number[] {
  if (value.length >= 128) throw new Error("Test helper only supports short DER lengths.");
  return [...tag, value.length, ...value];
}
function seq(...items: number[][]): number[] {
  return tlv([0x30], items.flat());
}
function int(value: number): number[] {
  return tlv([0x02], [value]);
}
function enumerated(value: number): number[] {
  return tlv([0x0a], [value]);
}
function octets(...value: number[]): number[] {
  return tlv([0x04], value);
}
function keyDescription(
  software: number[] = seq(),
  hardware: number[] = seq(),
  securityLevel = 1,
): Uint8Array {
  return new Uint8Array(seq(
    int(4), enumerated(securityLevel), int(4), enumerated(securityLevel),
    octets(1, 2, 3), octets(), software, hardware,
  ));
}
function throws(fn: () => unknown, label: string): void {
  let rejected = false;
  try { fn(); } catch { rejected = true; }
  if (!rejected) throw new Error(`Expected rejection: ${label}`);
}

Deno.test("KeyDescription decodes the exact eight-field top-level schema", () => {
  const decoded = parseAndroidKeyDescription(keyDescription());
  if (
    decoded.attestationVersion !== 4n ||
    decoded.keyMintVersion !== 4n ||
    decoded.attestationSecurityLevel !== 1 ||
    decoded.keyMintSecurityLevel !== 1 ||
    decoded.attestationChallenge.join(",") !== "1,2,3" ||
    decoded.uniqueId.length !== 0
  ) throw new Error("Unexpected KeyDescription fields.");
});

Deno.test("KeyDescription rejects wrong field count and wrong ASN.1 types", () => {
  throws(() => parseAndroidKeyDescription(new Uint8Array(seq(int(1)))), "wrong field count");
  const wrongType = seq(
    int(1), enumerated(1), int(1), enumerated(1),
    int(2), octets(), seq(), seq(),
  );
  throws(() => parseAndroidKeyDescription(new Uint8Array(wrongType)), "challenge must be OCTET STRING");
});

Deno.test("KeyDescription rejects unsupported security levels and negative versions", () => {
  throws(() => parseAndroidKeyDescription(keyDescription(seq(), seq(), 3)), "unknown security level");
  const negativeVersion = seq(
    tlv([0x02], [0xff]), enumerated(1), int(1), enumerated(1),
    octets(), octets(), seq(), seq(),
  );
  throws(() => parseAndroidKeyDescription(new Uint8Array(negativeVersion)), "negative version");
});

Deno.test("AuthorizationList accepts known explicit integer and SET OF tags", () => {
  const purposeSet = tlv([0x31], [...int(2), ...int(3)]);
  const purpose = tlv([0xa1], purposeSet);
  const algorithm = tlv([0xa2], int(3));
  const decoded = parseAndroidKeyDescription(keyDescription(seq(purpose, algorithm)));
  const entries = decoded.softwareEnforced.entries;
  if (entries.length !== 2 || entries[0].tagNumber !== 1 || entries[1].tagNumber !== 2) {
    throw new Error("AuthorizationList entries were not decoded.");
  }
});

Deno.test("AuthorizationList records out-of-order tags but does not silently normalize them", () => {
  const algorithm = tlv([0xa2], int(3));
  const purpose = tlv([0xa1], tlv([0x31], int(2)));
  const decoded = parseAndroidKeyDescription(keyDescription(seq(algorithm, purpose)));
  if (decoded.softwareEnforced.tagsAreAscending) {
    throw new Error("Out-of-order tags were not recorded.");
  }
});

Deno.test("AuthorizationList rejects duplicate, unknown and implicit/non-explicit tags", () => {
  const algorithm = tlv([0xa2], int(3));
  throws(() => parseAndroidKeyDescription(keyDescription(seq(algorithm, algorithm))), "duplicate tag");
  throws(() => parseAndroidKeyDescription(keyDescription(seq(tlv([0xa5], int(1))))), "unknown tag");
  throws(() => parseAndroidKeyDescription(keyDescription(seq(tlv([0x82], [3])))), "implicit tag");
});

Deno.test("AuthorizationList validates RootOfTrust structure and boot-state range", () => {
  const rootOfTrust = seq(octets(9), tlv([0x01], [0xff]), enumerated(0));
  const rootTag = tlv([0xbf, 0x85, 0x40], rootOfTrust); // context tag [704]
  const decoded = parseAndroidKeyDescription(keyDescription(seq(), seq(rootTag)));
  if (decoded.hardwareEnforced.entries[0]?.tagNumber !== 704) {
    throw new Error("RootOfTrust tag was not decoded.");
  }
  const badRoot = seq(octets(9), tlv([0x01], [0xff]), enumerated(9));
  throws(
    () => parseAndroidKeyDescription(keyDescription(seq(), seq(tlv([0xbf, 0x85, 0x40], badRoot)))),
    "unknown boot state",
  );
});

Deno.test("AuthorizationList tag 709 decodes the nested DER AttestationApplicationId", () => {
  const packageName = octets(...new TextEncoder().encode("com.neweix.supreme"));
  const packageVersion = int(12);
  const packageInfo = seq(packageName, packageVersion);
  const appId = seq(tlv([0x31], packageInfo), tlv([0x31], []));
  const appIdTag = tlv([0xbf, 0x85, 0x45], octets(...appId));
  const decoded = parseAndroidKeyDescription(keyDescription(seq(), seq(appIdTag)));
  const parsed = decoded.hardwareEnforced.entries[0]?.attestationApplicationId;
  if (
    parsed?.packages[0]?.packageName !== "com.neweix.supreme" ||
    parsed.packages[0].version !== 12n
  ) throw new Error("Nested AttestationApplicationId was not decoded.");
});

Deno.test("AuthorizationList recognizes upstream ALLOW_WHILE_ON_BODY tag 506", () => {
  const allowWhileOnBody = tlv([0xbf, 0x83, 0x7a], tlv([0x05], []));
  const decoded = parseAndroidKeyDescription(keyDescription(seq(), seq(allowWhileOnBody)));
  if (decoded.hardwareEnforced.entries[0]?.tagNumber !== 506) {
    throw new Error("Known Android authorization tag 506 was rejected.");
  }
});

Deno.test("AuthorizationList decodes Android second-IMEI tag 723 as OCTET STRING", () => {
  const secondImei = tlv([0xbf, 0x85, 0x53], octets(1, 2, 3));
  const decoded = parseAndroidKeyDescription(keyDescription(seq(), seq(secondImei)));
  const entry = decoded.hardwareEnforced.entries[0];
  if (entry?.tagNumber !== 723 || entry.value.value.join(",") !== "1,2,3") {
    throw new Error("Second-IMEI tag 723 was not decoded as an OCTET STRING.");
  }
});

Deno.test("AuthorizationList rejects malformed SET OF and NULL marker payloads", () => {
  throws(
    () => parseAndroidKeyDescription(keyDescription(seq(tlv([0xa1], int(1))))),
    "purpose must be SET OF",
  );
  throws(
    () => parseAndroidKeyDescription(keyDescription(seq(tlv([0xbf, 0x83, 0x77], int(1))))),
    "unknown tag",
  );
});
