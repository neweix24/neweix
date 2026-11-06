import { parseAndroidKeyDescription } from "./supreme-android-keydescription.ts";
import { DerElement } from "./supreme-attestation-der.ts";

type Fixture = { source: string; certificateIndex: number; derBase64: string };
type ExpectedAppId = {
  packages: Array<{ name: string; version: string }>;
  signatures: string[];
};
type ExpectedRootOfTrust = {
  verifiedBootKey: string;
  deviceLocked: boolean;
  verifiedBootState: "VERIFIED" | "SELF_SIGNED" | "UNVERIFIED" | "FAILED";
  verifiedBootHash?: string;
};
type ExpectedAuthorizationList = Record<string, unknown> & {
  attestationApplicationId?: ExpectedAppId;
};
type ExpectedJson = {
  attestationVersion: string;
  attestationSecurityLevel: string;
  keyMintVersion: string;
  keyMintSecurityLevel: string;
  attestationChallenge: string;
  uniqueId: string;
  softwareEnforced: ExpectedAuthorizationList;
  hardwareEnforced: ExpectedAuthorizationList & { rootOfTrust?: ExpectedRootOfTrust };
};

function bytesFromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}
function bytesToHex(value: Uint8Array): string {
  return Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
function parseUpstreamJson(text: string): ExpectedJson {
  // Upstream fixture companions are JSONC and may start with // explanatory comments.
  const withoutLineComments = text.replace(/^\\s*\\/\\/[^\\r\\n]*(?:\\r?\\n|$)/gm, "");
  return JSON.parse(withoutLineComments) as ExpectedJson;
}
function securityLevel(value: string): number {
  switch (value) {
    case "SOFTWARE": return 0;
    case "TRUSTED_ENVIRONMENT": return 1;
    case "STRONGBOX": return 2;
    case "STRONG_BOX": return 2;
    default: throw new Error(`Unknown upstream security level: ${value}`);
  }
}
function integerValue(element: DerElement, label: string): bigint {
  if (element.tagClass !== "universal" || element.tagNumber !== 2 || element.constructed) {
    throw new Error(`${label}: expected DER INTEGER.`);
  }
  if (element.value.length === 0) throw new Error(`${label}: empty DER INTEGER.`);
  let value = 0n;
  for (const byte of element.value) value = (value << 8n) | BigInt(byte);
  if ((element.value[0] & 0x80) !== 0) {
    value -= 1n << BigInt(element.value.length * 8);
  }
  return value;
}
function findEntry(list: { entries: Array<{ tagNumber: number; value: DerElement }> }, tag: number) {
  return list.entries.find((entry) => entry.tagNumber === tag);
}
function compareIntegerField(
  label: string,
  list: { entries: Array<{ tagNumber: number; value: DerElement }> },
  tag: number,
  expected: unknown,
): void {
  const entry = findEntry(list, tag);
  if (!entry || integerValue(entry.value, label) !== BigInt(String(expected))) {
    throw new Error(`${label}: authorization tag ${tag} differs from upstream JSON.`);
  }
}
function compareSetField(
  label: string,
  list: { entries: Array<{ tagNumber: number; value: DerElement }> },
  tag: number,
  expected: unknown,
): void {
  const entry = findEntry(list, tag);
  if (!entry || entry.value.tagClass !== "universal" || entry.value.tagNumber !== 17) {
    throw new Error(`${label}: authorization SET tag ${tag} is missing or malformed.`);
  }
  const actual = entry.value.children.map((item) => integerValue(item, label).toString()).sort();
  const wanted = (expected as unknown[]).map((item) => String(item)).sort();
  if (actual.join("|") !== wanted.join("|")) {
    throw new Error(`${label}: authorization SET tag ${tag} differs from upstream JSON.`);
  }
}
function compareOctetTextField(
  label: string,
  list: { entries: Array<{ tagNumber: number; value: DerElement }> },
  tag: number,
  expected: unknown,
): void {
  const entry = findEntry(list, tag);
  if (!entry || entry.value.tagClass !== "universal" || entry.value.tagNumber !== 4) {
    throw new Error(`${label}: authorization OCTET STRING tag ${tag} is missing or malformed.`);
  }
  const actual = new TextDecoder("utf-8", { fatal: true }).decode(entry.value.value);
  if (actual !== String(expected)) {
    throw new Error(`${label}: authorization tag ${tag} text differs from upstream JSON.`);
  }
}
function compareAuthorizationFields(
  label: string,
  list: { entries: Array<{ tagNumber: number; value: DerElement }> },
  expected: ExpectedAuthorizationList,
): number {
  let comparisons = 0;
  const integerFields: Array<[string, number]> = [
    ["algorithms", 2],
    ["keySize", 3],
    ["ecCurve", 10],
    ["rsaPublicExponent", 200],
    ["creationDateTime", 701],
    ["osVersion", 705],
    ["osPatchLevel", 706],
    ["vendorPatchLevel", 718],
    ["bootPatchLevel", 719],
  ];
  for (const [name, tag] of integerFields) {
    if (expected[name] !== undefined) {
      compareIntegerField(`${label}.${name}`, list, tag, expected[name]);
      comparisons++;
    }
  }

  const setFields: Array<[string, number]> = [
    ["purposes", 1],
    ["digests", 5],
    ["padding", 6],
  ];
  for (const [name, tag] of setFields) {
    if (expected[name] !== undefined) {
      compareSetField(`${label}.${name}`, list, tag, expected[name]);
      comparisons++;
    }
  }

  const textFields: Array<[string, number]> = [
    ["attestationIdBrand", 710],
    ["attestationIdDevice", 711],
    ["attestationIdProduct", 712],
    ["attestationIdSerial", 713],
    ["attestationIdImei", 714],
    ["attestationIdMeid", 715],
    ["attestationIdManufacturer", 716],
    ["attestationIdModel", 717],
    ["moduleHash", 724],
  ];
  for (const [name, tag] of textFields) {
    if (expected[name] !== undefined) {
      // Module hash is binary; compare its base64 representation rather than decoding as text.
      if (name === "moduleHash") {
        const entry = findEntry(list, tag);
        const actual = entry && entry.value.tagClass === "universal" && entry.value.tagNumber === 4
          ? btoa(String.fromCharCode(...entry.value.value))
          : "";
        if (actual !== String(expected[name])) {
          throw new Error(`${label}.${name}: authorization tag ${tag} differs from upstream JSON.`);
        }
      } else {
        compareOctetTextField(`${label}.${name}`, list, tag, expected[name]);
      }
      comparisons++;
    }
  }

  const originNames: Record<string, string> = {
    GENERATED: "0",
    DERIVED: "1",
    IMPORTED: "2",
    UNKNOWN: "3",
  };
  if (expected.origin !== undefined) {
    const encoded = originNames[String(expected.origin)];
    if (encoded === undefined) throw new Error(`${label}.origin: unknown upstream value.`);
    compareIntegerField(`${label}.origin`, list, 702, encoded);
    comparisons++;
  }

  if (expected.noAuthRequired !== undefined) {
    const present = Boolean(findEntry(list, 503));
    if (present !== Boolean(expected.noAuthRequired)) {
      throw new Error(`${label}.noAuthRequired: authorization marker tag 503 differs from upstream JSON.`);
    }
    comparisons++;
  }
  return comparisons;
}
function rollbackTag(): number {
  // Android Keymaster ROLLBACK_RESISTANCE is tag 303; it is not currently accepted by this parser.
  // Keep this helper explicit so the fixture comparator never silently maps it to another tag.
  return 303;
}

const fixtureIndex = Deno.env.get("SUPREME_ATTESTATION_FIXTURE_INDEX");
const upstreamRoot = Deno.env.get("SUPREME_ATTESTATION_UPSTREAM_DIR");

Deno.test({
  name: "Deno KeyDescription parser matches real Google Android PEM fixture semantics",
  ignore: !fixtureIndex || !upstreamRoot,
  fn: async () => {
    const fixtures = JSON.parse(await Deno.readTextFile(fixtureIndex!)) as Fixture[];
    if (fixtures.length === 0) throw new Error("No real certificate fixtures were extracted.");
    let authorizationComparisons = 0;

    for (const fixture of fixtures) {
      const der = bytesFromBase64(fixture.derBase64);
      const decoded = parseAndroidKeyDescription(der);
      const jsonPath = `${upstreamRoot}/${fixture.source.replace(/\\.pem$/, ".json")}`;
      const expected = parseUpstreamJson(await Deno.readTextFile(jsonPath));

      const label = `${fixture.source} (certificate #${fixture.certificateIndex})`;
      if (decoded.attestationVersion !== BigInt(expected.attestationVersion)) {
        throw new Error(`${label}: attestationVersion differs from upstream JSON.`);
      }
      if (decoded.keyMintVersion !== BigInt(expected.keyMintVersion)) {
        throw new Error(`${label}: keyMintVersion differs from upstream JSON.`);
      }
      if (decoded.attestationSecurityLevel !== securityLevel(expected.attestationSecurityLevel)) {
        throw new Error(`${label}: attestationSecurityLevel differs from upstream JSON.`);
      }
      if (decoded.keyMintSecurityLevel !== securityLevel(expected.keyMintSecurityLevel)) {
        throw new Error(`${label}: keyMintSecurityLevel differs from upstream JSON.`);
      }
      if (bytesToHex(decoded.attestationChallenge) !== bytesToHex(bytesFromBase64(expected.attestationChallenge))) {
        throw new Error(`${label}: attestation challenge differs from upstream JSON.`);
      }
      if (bytesToHex(decoded.uniqueId) !== bytesToHex(bytesFromBase64(expected.uniqueId))) {
        throw new Error(`${label}: uniqueId differs from upstream JSON.`);
      }

      const expectedRoot = expected.hardwareEnforced.rootOfTrust;
      if (expectedRoot) {
        const rootEntry = decoded.hardwareEnforced.entries.find((entry) => entry.tagNumber === 704);
        const rootFields = rootEntry?.value.children;
        if (!rootFields || (rootFields.length !== 3 && rootFields.length !== 4)) {
          throw new Error(`${label}: parser did not expose RootOfTrust fields.`);
        }
        const actualBootState = rootFields[2].value.reduce((value, byte) => value * 256 + byte, 0);
        const expectedBootState = {
          VERIFIED: 0,
          SELF_SIGNED: 1,
          UNVERIFIED: 2,
          FAILED: 3,
        }[expectedRoot.verifiedBootState];
        if (
          bytesToHex(rootFields[0].value) !== bytesToHex(bytesFromBase64(expectedRoot.verifiedBootKey)) ||
          (rootFields[1].value[0] === 0xff) !== expectedRoot.deviceLocked ||
          actualBootState !== expectedBootState ||
          (expectedRoot.verifiedBootHash !== undefined &&
            bytesToHex(rootFields[3]?.value ?? new Uint8Array()) !==
              bytesToHex(bytesFromBase64(expectedRoot.verifiedBootHash)))
        ) {
          throw new Error(`${label}: RootOfTrust fields differ from upstream JSON.`);
        }
      }

      authorizationComparisons += compareAuthorizationFields(
        `${label}.softwareEnforced`,
        decoded.softwareEnforced,
        expected.softwareEnforced,
      );
      authorizationComparisons += compareAuthorizationFields(
        `${label}.hardwareEnforced`,
        decoded.hardwareEnforced,
        expected.hardwareEnforced,
      );

      const expectedAppId = expected.softwareEnforced.attestationApplicationId ??
        expected.hardwareEnforced.attestationApplicationId;
      if (expectedAppId) {
        const actualAppId = [
          ...decoded.softwareEnforced.entries,
          ...decoded.hardwareEnforced.entries,
        ].find((entry) => entry.tagNumber === 709)?.attestationApplicationId;
        if (!actualAppId) throw new Error(`${label}: parser did not expose AttestationApplicationId.`);
        const actualPackages = actualAppId.packages
          .map((item) => `${item.packageName}:${item.version}`).sort();
        const expectedPackages = expectedAppId.packages
          .map((item) => `${item.name}:${BigInt(item.version)}`).sort();
        if (actualPackages.join("|") !== expectedPackages.join("|")) {
          throw new Error(`${label}: AttestationApplicationId packages differ from upstream JSON.`);
        }
        const actualDigests = actualAppId.signatureDigests.map(bytesToHex).sort();
        const expectedDigests = expectedAppId.signatures.map((item) => bytesToHex(bytesFromBase64(item))).sort();
        if (actualDigests.join("|") !== expectedDigests.join("|")) {
          throw new Error(`${label}: AttestationApplicationId signer digests differ from upstream JSON.`);
        }
      }
    }
    console.log(
      `Validated ${fixtures.length} real Android certificate extension(s) and ${authorizationComparisons} AuthorizationList fields against upstream decoded JSON.`,
    );
  },
});
