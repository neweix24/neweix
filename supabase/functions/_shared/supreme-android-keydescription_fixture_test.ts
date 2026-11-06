import { parseAndroidKeyDescription } from "./supreme-android-keydescription.ts";

type Fixture = { source: string; certificateIndex: number; derBase64: string };
type ExpectedAppId = {
  packages: Array<{ name: string; version: string }>;
  signatures: string[];
};
type ExpectedJson = {
  attestationVersion: string;
  attestationSecurityLevel: string;
  keyMintVersion: string;
  keyMintSecurityLevel: string;
  attestationChallenge: string;
  softwareEnforced: { attestationApplicationId?: ExpectedAppId };
  hardwareEnforced: { attestationApplicationId?: ExpectedAppId };
};

function bytesFromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}
function bytesToHex(value: Uint8Array): string {
  return Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
function securityLevel(value: string): number {
  switch (value) {
    case "SOFTWARE": return 0;
    case "TRUSTED_ENVIRONMENT": return 1;
    case "STRONGBOX": return 2;
    default: throw new Error(`Unknown upstream security level: ${value}`);
  }
}

const fixtureIndex = Deno.env.get("SUPREME_ATTESTATION_FIXTURE_INDEX");
const upstreamRoot = Deno.env.get("SUPREME_ATTESTATION_UPSTREAM_DIR");

Deno.test({
  name: "Deno KeyDescription parser matches real Google Android PEM fixture semantics",
  ignore: !fixtureIndex || !upstreamRoot,
  fn: async () => {
    const fixtures = JSON.parse(await Deno.readTextFile(fixtureIndex!)) as Fixture[];
    if (fixtures.length === 0) throw new Error("No real certificate fixtures were extracted.");

    for (const fixture of fixtures) {
      const der = bytesFromBase64(fixture.derBase64);
      const decoded = parseAndroidKeyDescription(der);
      const jsonPath = `${upstreamRoot}/${fixture.source.replace(/\\.pem$/, ".json")}`;
      const expected = JSON.parse(await Deno.readTextFile(jsonPath)) as ExpectedJson;

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
    console.log(`Validated ${fixtures.length} real Android certificate extension(s) against upstream decoded JSON.`);
  },
});
