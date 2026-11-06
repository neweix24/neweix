import { ANDROID_PROVISIONING_INFO_OID } from "./supreme-android-provisioning-info.ts";
import { parseX509Certificate } from "./supreme-x509-certificate.ts";
import {
  classifyAndroidProvisioningMethod,
  validateX509CertificatePath,
  x509SerialToHex,
} from "./supreme-x509-chain.ts";
import type { GoogleAttestationStatus } from "./supreme-google-attestation-metadata.ts";

type CertificateFixture = { source: string; certificatesBase64: string[] };

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}
function fromPem(value: string): Uint8Array {
  const match = value.match(/^-----BEGIN CERTIFICATE-----\s*([A-Za-z0-9+/=\r\n]+)\s*-----END CERTIFICATE-----$/u);
  if (!match) throw new TypeError("Invalid fixture root PEM.");
  return fromBase64(match[1].replace(/\s/gu, ""));
}
function assertThrows(fn: () => unknown, expectedText: string): void {
  try {
    const result = fn();
    if (result instanceof Promise) {
      throw new Error("Use assertRejects for asynchronous validation.");
    }
  } catch (error) {
    if (String(error).includes(expectedText)) return;
    throw new Error(`Unexpected error: ${String(error)}`);
  }
  throw new Error("Expected validation to reject.");
}
async function assertRejects(
  fn: () => Promise<unknown>,
  expectedText: string,
): Promise<void> {
  try {
    await fn();
  } catch (error) {
    if (String(error).includes(expectedText)) return;
    throw new Error(`Unexpected error: ${String(error)}`);
  }
  throw new Error("Expected validation to reject.");
}
function emptyStatus(validationTimeMs = Date.now()): GoogleAttestationStatus {
  return {
    entries: new Map(),
    fetchedAtMs: validationTimeMs - 1_000,
    expiresAtMs: validationTimeMs + 3_599_000,
    maxAgeSeconds: 3600,
  };
}
function toHex(value: Uint8Array): string {
  return Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const fixtureIndex = Deno.env.get("SUPREME_ATTESTATION_CERTIFICATE_FIXTURE_INDEX");
const rootsPath = Deno.env.get("SUPREME_GOOGLE_ROOTS_FIXTURE_PATH");

Deno.test({
  name: "Pinned Google trust anchors validate the reference TEE chain including root rollover",
  ignore: !fixtureIndex || !rootsPath,
  fn: async () => {
    const fixtures = JSON.parse(await Deno.readTextFile(fixtureIndex!)) as CertificateFixture[];
    const rootPemList = JSON.parse(await Deno.readTextFile(rootsPath!)) as string[];
    const trustedRoots = rootPemList.map((pem) => parseX509Certificate(fromPem(pem)));
    const fixture = fixtures.find((item) =>
      item.source.endsWith("blueline/sdk28/TEE_EC_NONE.pem")
    );
    if (!fixture) throw new Error("Pinned Google verifier's positive TEE reference chain is missing.");
    const chain = fixture.certificatesBase64.map((certificate) =>
      parseX509Certificate(fromBase64(certificate))
    );
    const result = await validateX509CertificatePath(chain, trustedRoots, emptyStatus());
    if (
      result.signatureLinksVerified !== chain.length - 1 ||
      result.revocationEntriesChecked !== chain.length - 1
    ) {
      throw new Error("Incomplete cryptographic path validation counts.");
    }
    console.log(
      `Pinned Google TEE reference path passed: ${result.signatureLinksVerified} certificate signatures and ${result.revocationEntriesChecked} non-root serials checked against ${trustedRoots.length} current Google anchors.`,
    );
  },
});

Deno.test({
  name: "X.509 path rejects untrusted anchors, wrong issuer names and blocked serials",
  ignore: !fixtureIndex || !rootsPath,
  fn: async () => {
    const fixtures = JSON.parse(await Deno.readTextFile(fixtureIndex!)) as CertificateFixture[];
    const rootsPem = JSON.parse(await Deno.readTextFile(rootsPath!)) as string[];
    const trustedRoots = rootsPem.map((pem) => parseX509Certificate(fromPem(pem)));
    const fixture = fixtures.find((item) =>
      item.source.endsWith("blueline/sdk28/TEE_EC_NONE.pem")
    );
    if (!fixture) throw new Error("Pinned Google verifier's positive TEE reference chain is missing.");
    const chain = fixture.certificatesBase64.map((value) =>
      parseX509Certificate(fromBase64(value))
    );

    const unrelatedRoot = trustedRoots.find((candidate) =>
      toHex(candidate.subject) !== toHex(chain[chain.length - 2].issuer)
    );
    if (!unrelatedRoot) throw new Error("No unrelated Google root fixture for the negative test.");
    await assertRejects(
      () => validateX509CertificatePath(chain, [unrelatedRoot], emptyStatus()),
      "No Google trust anchor matches the chain issuer name.",
    );

    const wrongNameChain = chain.map((certificate) => ({ ...certificate }));
    wrongNameChain[0] = { ...wrongNameChain[0], issuer: new Uint8Array([0x30, 0x00]) };
    await assertRejects(
      () => validateX509CertificatePath(wrongNameChain, trustedRoots, emptyStatus()),
      "issuer/subject name chaining failed",
    );

    const tamperedTopChain = chain.map((certificate) => ({ ...certificate }));
    const topIndex = tamperedTopChain.length - 2;
    const alteredSignature = tamperedTopChain[topIndex].signature.slice();
    alteredSignature[alteredSignature.length - 1] ^= 0x01;
    tamperedTopChain[topIndex] = {
      ...tamperedTopChain[topIndex],
      signature: alteredSignature,
    };
    await assertRejects(
      () => validateX509CertificatePath(tamperedTopChain, trustedRoots, emptyStatus()),
      "Top path certificate does not verify",
    );

    const blockedStatus = emptyStatus();
    blockedStatus.entries.set(x509SerialToHex(chain[0].serialNumber), { status: "REVOKED" });
    await assertRejects(
      () => validateX509CertificatePath(chain, trustedRoots, blockedStatus),
      "Google has blocked certificate serial",
    );
  },
});

Deno.test("X.509 serial normalization matches unpadded lower-case hexadecimal", () => {
  const serial = new Uint8Array([0x00, 0x01, 0x0a, 0xff]);
  if (x509SerialToHex(serial) !== "10aff") {
    throw new Error("X.509 serial normalization is not canonical.");
  }
  assertThrows(() => x509SerialToHex(new Uint8Array([0x00])), "zero");
});

type PathPolicyFixture = {
  name: string;
  provisioningMethod: "FACTORY_PROVISIONED" | "REMOTELY_PROVISIONED" | "UNKNOWN";
  valid: boolean;
  validationTimeMs: number;
  certificatesBase64: string[];
  trustAnchorBase64: string;
  provisioningInfoValid: boolean;
  provisioningCertificatesIssued: number | null;
};

const pathPolicyIndex = Deno.env.get("SUPREME_PATH_POLICY_FIXTURE_INDEX");

Deno.test({
  name: "Deno chain roles and Android validity exceptions match pinned Kotlin verifier fixtures",
  ignore: !pathPolicyIndex,
  fn: async () => {
    const fixtures = JSON.parse(
      await Deno.readTextFile(pathPolicyIndex!),
    ) as PathPolicyFixture[];
    if (fixtures.length < 7) {
      throw new Error("Pinned Google path-policy oracle fixture set is incomplete.");
    }

    for (const fixture of fixtures) {
      const chain = fixture.certificatesBase64.map((value) =>
        parseX509Certificate(fromBase64(value))
      );
      const trustAnchor = parseX509Certificate(fromBase64(fixture.trustAnchorBase64));
      const detectedMethod = classifyAndroidProvisioningMethod(chain[chain.length - 2].subject);
      if (detectedMethod !== fixture.provisioningMethod) {
        throw new Error(
          `${fixture.name}: provisioning method ${detectedMethod} did not match Kotlin ${fixture.provisioningMethod}.`,
        );
      }

      let accepted = false;
      let result: Awaited<ReturnType<typeof validateX509CertificatePath>> | undefined;
      let rejection = "";
      try {
        result = await validateX509CertificatePath(
          chain,
          [trustAnchor],
          emptyStatus(fixture.validationTimeMs),
          fixture.validationTimeMs,
        );
        accepted = true;
      } catch (error) {
        rejection = String(error);
      }

      if (accepted !== fixture.valid) {
        throw new Error(
          `${fixture.name}: Deno accepted=${accepted}, pinned Kotlin accepted=${fixture.valid}; ${rejection}`,
        );
      }
      if (!accepted && fixture.provisioningMethod === "REMOTELY_PROVISIONED" && !fixture.provisioningInfoValid && !rejection.toLowerCase().includes("provision")) {
        throw new Error(`${fixture.name}: malformed RKP provisioning information was not the rejection reason: ${rejection}`);
      }
      if (accepted) {
        if (
          result!.provisioningMethod !== fixture.provisioningMethod ||
          (result!.provisioningInfo?.certificatesIssued ?? null) !== fixture.provisioningCertificatesIssued ||
          !fixture.provisioningInfoValid ||
          result!.chainRolesValidated !== chain.length - 1 ||
          result!.validityCertificatesChecked !== chain.length - 2 ||
          result!.signatureLinksVerified !== chain.length - 1
        ) {
          throw new Error(`${fixture.name}: successful path validation reported incomplete checks.`);
        }
      }
    }
    console.log(
      `Matched Deno Android provisioning roles and validity rules against ${fixtures.length} pinned Kotlin-generated reference chains.`,
    );
  },
});

Deno.test({
  name: "RKP provisioning info is bound only to the attestation certificate",
  ignore: !pathPolicyIndex,
  fn: async () => {
    const fixtures = JSON.parse(
      await Deno.readTextFile(pathPolicyIndex!),
    ) as PathPolicyFixture[];
    const rkpFixture = fixtures.find((fixture) => fixture.name === "rkp_valid");
    const factoryFixture = fixtures.find((fixture) => fixture.name === "factory_valid");
    if (!rkpFixture || !factoryFixture) {
      throw new Error("Pinned Kotlin RKP/factory fixtures are missing.");
    }

    const rkpChain = rkpFixture.certificatesBase64.map((value) =>
      parseX509Certificate(fromBase64(value))
    );
    const trustAnchor = parseX509Certificate(fromBase64(rkpFixture.trustAnchorBase64));
    const provisioningExtension = rkpChain[1].extensions.find((extension) =>
      extension.oid === ANDROID_PROVISIONING_INFO_OID
    );
    if (!provisioningExtension) {
      throw new Error("Kotlin RKP attestation fixture has no provisioning-info extension.");
    }

    const missing = rkpChain.map((certificate) => ({ ...certificate }));
    missing[1] = {
      ...missing[1],
      extensions: missing[1].extensions.filter((extension) =>
        extension.oid !== ANDROID_PROVISIONING_INFO_OID
      ),
    };
    await assertRejects(
      () => validateX509CertificatePath(missing, [trustAnchor], emptyStatus(rkpFixture.validationTimeMs), rkpFixture.validationTimeMs),
      "must appear exactly once on the attestation certificate at index 1",
    );

    const misplaced = rkpChain.map((certificate) => ({ ...certificate }));
    misplaced[1] = {
      ...misplaced[1],
      extensions: misplaced[1].extensions.filter((extension) =>
        extension.oid !== ANDROID_PROVISIONING_INFO_OID
      ),
    };
    misplaced[2] = {
      ...misplaced[2],
      extensions: [...misplaced[2].extensions, provisioningExtension],
    };
    await assertRejects(
      () => validateX509CertificatePath(misplaced, [trustAnchor], emptyStatus(), rkpFixture.validationTimeMs),
      "must appear exactly once on the attestation certificate at index 1",
    );

    const factoryChain = factoryFixture.certificatesBase64.map((value) =>
      parseX509Certificate(fromBase64(value))
    );
    const factoryAnchor = parseX509Certificate(fromBase64(factoryFixture.trustAnchorBase64));
    factoryChain[1] = {
      ...factoryChain[1],
      extensions: [...factoryChain[1].extensions, provisioningExtension],
    };
    await assertRejects(
      () => validateX509CertificatePath(factoryChain, [factoryAnchor], emptyStatus(factoryFixture.validationTimeMs), factoryFixture.validationTimeMs),
      "unexpected on a non-RKP chain",
    );
  },
});

Deno.test("Android chain role classifier rejects malformed distinguished names", () => {
  let rejected = false;
  try {
    classifyAndroidProvisioningMethod(new Uint8Array([0x30, 0x02, 0x30, 0x00]));
  } catch {
    rejected = true;
  }
  if (!rejected) throw new Error("Accepted a malformed X.509 Name.");
});

