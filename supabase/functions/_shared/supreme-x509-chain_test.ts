import { parseX509Certificate } from "./supreme-x509-certificate.ts";
import {
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
function emptyStatus(): GoogleAttestationStatus {
  return { entries: new Map(), maxAgeSeconds: 3600 };
}
function toHex(value: Uint8Array): string {
  return Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const fixtureIndex = Deno.env.get("SUPREME_ATTESTATION_CERTIFICATE_FIXTURE_INDEX");
const rootsPath = Deno.env.get("SUPREME_GOOGLE_ROOTS_FIXTURE_PATH");

Deno.test({
  name: "X.509 path matches pinned Google roots and verifies all real Android chain links",
  ignore: !fixtureIndex || !rootsPath,
  fn: async () => {
    const fixtures = JSON.parse(await Deno.readTextFile(fixtureIndex!)) as CertificateFixture[];
    const rootPemList = JSON.parse(await Deno.readTextFile(rootsPath!)) as string[];
    if (rootPemList.length === 0) throw new Error("Pinned Google root fixture is empty.");
    const trustedRoots = rootPemList.map((pem) => parseX509Certificate(fromPem(pem)));
    let validatedChains = 0;
    let signatureLinks = 0;
    let revocationEntries = 0;

    for (const fixture of fixtures) {
      const chain = fixture.certificatesBase64.map((certificate) =>
        parseX509Certificate(fromBase64(certificate))
      );
      const result = await validateX509CertificatePath(chain, trustedRoots, emptyStatus());
      if (
        result.signatureLinksVerified !== chain.length - 1 ||
        result.revocationEntriesChecked !== chain.length - 1
      ) {
        throw new Error(`${fixture.source}: incomplete path validation counts.`);
      }
      signatureLinks += result.signatureLinksVerified;
      revocationEntries += result.revocationEntriesChecked;
      validatedChains++;
    }

    if (validatedChains !== fixtures.length || validatedChains === 0) {
      throw new Error("Not all real Android chains were path-checked.");
    }
    console.log(
      `Validated ${validatedChains} real Android paths, ${signatureLinks} signature links and ${revocationEntries} non-root serials against ${trustedRoots.length} pinned Google roots.`,
    );
  },
});

Deno.test("X.509 path rejects an untrusted root, wrong issuer name and blocked serial", async () => {
  const fixtureBytes = Deno.env.get("SUPREME_ATTESTATION_CERTIFICATE_FIXTURE_INDEX");
  const rootsFile = Deno.env.get("SUPREME_GOOGLE_ROOTS_FIXTURE_PATH");
  if (!fixtureBytes || !rootsFile) return;
  const fixtures = JSON.parse(await Deno.readTextFile(fixtureBytes)) as CertificateFixture[];
  const rootsPem = JSON.parse(await Deno.readTextFile(rootsFile)) as string[];
  const trustedRoots = rootsPem.map((pem) => parseX509Certificate(fromPem(pem)));
  const fixture = fixtures[0];
  const chain = fixture.certificatesBase64.map((value) => parseX509Certificate(fromBase64(value)));

  const unrelatedRoot = parseX509Certificate(fromPem(rootsPem.find((pem) => {
    const candidate = parseX509Certificate(fromPem(pem));
    return toHex(candidate.rawCertificate) !== toHex(chain[chain.length - 1].rawCertificate);
  }) ?? rootsPem[0]));
  if (toHex(unrelatedRoot.rawCertificate) !== toHex(chain[chain.length - 1].rawCertificate)) {
    await assertRejects(
      () => validateX509CertificatePath(chain, [unrelatedRoot], emptyStatus()),
      "No Google trust anchor matches the chain issuer name.",
    );
  }

  const wrongNameChain = chain.map((certificate) => ({ ...certificate }));
  wrongNameChain[0] = { ...wrongNameChain[0], issuer: new Uint8Array([0x30, 0x00]) };
  await assertRejects(
    () => validateX509CertificatePath(wrongNameChain, trustedRoots, emptyStatus()),
    "issuer/subject name chaining failed",
  );

  const blockedStatus = emptyStatus();
  blockedStatus.entries.set(x509SerialToHex(chain[0].serialNumber), { status: "REVOKED" });
  await assertRejects(
    () => validateX509CertificatePath(chain, trustedRoots, blockedStatus),
    "Google has blocked certificate serial",
  );
});

Deno.test("X.509 serial normalization matches unpadded lower-case hexadecimal", () => {
  const serial = new Uint8Array([0x00, 0x01, 0x0a, 0xff]);
  if (x509SerialToHex(serial) !== "10aff") {
    throw new Error("X.509 serial normalization is not canonical.");
  }
  assertThrows(() => x509SerialToHex(new Uint8Array([0x00])), "zero");
});
