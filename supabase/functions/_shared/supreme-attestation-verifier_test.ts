import { parseX509Certificate } from "./supreme-x509-certificate.ts";
import {
  importSupremeAttestationProofPublicKey,
  verifySupremeAndroidAttestation,
} from "./supreme-attestation-verifier.ts";
import { verifySupremeChallengeProof } from "./supreme-attestation-proof.ts";
import type {
  GoogleAttestationRoots,
  GoogleAttestationStatus,
} from "./supreme-google-attestation-metadata.ts";

const fixtureIndex = Deno.env.get("SUPREME_PATH_POLICY_FIXTURE_INDEX");

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}
function emptyStatus(validationTimeMs = Date.now()): GoogleAttestationStatus {
  return {
    entries: new Map(),
    fetchedAtMs: validationTimeMs - 1_000,
    expiresAtMs: validationTimeMs + 3_599_000,
    maxAgeSeconds: 3600,
  };
}
function rootMetadata(der: Uint8Array, validationTimeMs: number): GoogleAttestationRoots {
  const base64 = btoa(String.fromCharCode(...der));
  const wrapped = base64.match(/.{1,64}/gu)?.join("\n") ?? base64;
  return {
    certificatesPem: [`-----BEGIN CERTIFICATE-----\n${wrapped}\n-----END CERTIFICATE-----\n`],
    fetchedAtMs: validationTimeMs - 1_000,
    expiresAtMs: validationTimeMs + 3_599_000,
    maxAgeSeconds: 3600,
  };
}
function rawEcdsaToDer(raw: Uint8Array): Uint8Array {
  function integer(value: Uint8Array): number[] {
    let offset = 0;
    while (offset < value.length - 1 && value[offset] === 0) offset++;
    const body = Array.from(value.slice(offset));
    if ((body[0] & 0x80) !== 0) body.unshift(0);
    return [0x02, body.length, ...body];
  }
  const half = raw.length / 2;
  const body = [...integer(raw.slice(0, half)), ...integer(raw.slice(half))];
  return new Uint8Array([0x30, body.length, ...body]);
}
function assertRejects(fn: () => Promise<unknown>, expected: string): Promise<void> {
  return fn().then(
    () => {
      throw new Error(`Expected rejection containing: ${expected}`);
    },
    (error) => {
      if (!String(error).includes(expected)) {
        throw new Error(`Unexpected rejection: ${String(error)}`);
      }
    },
  );
}

Deno.test("Supreme proof public-key importer accepts only P-256 id-ecPublicKey SPKI", async () => {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey));
  const leaf = {
    subjectPublicKeyAlgorithmOid: "1.2.840.10045.2.1",
    subjectPublicKeyParameters: new Uint8Array([
      0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07,
    ]),
    subjectPublicKeyInfo: spki,
  } as ReturnType<typeof parseX509Certificate>;
  const imported = await importSupremeAttestationProofPublicKey(leaf);
  if (imported.type !== "public" || imported.algorithm.name !== "ECDSA") {
    throw new Error("Imported proof key is not an ECDSA public key.");
  }

  await assertRejects(
    () => importSupremeAttestationProofPublicKey({
      ...leaf,
      subjectPublicKeyAlgorithmOid: "1.2.840.113549.1.1.1",
    }),
    "id-ecPublicKey",
  );
  await assertRejects(
    () => importSupremeAttestationProofPublicKey({
      ...leaf,
      subjectPublicKeyParameters: new Uint8Array([0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x08]),
    }),
    "P-256",
  );
});

Deno.test({
  name: "Supreme pipeline rejects stale Google root and revocation metadata before path validation",
  ignore: !fixtureIndex,
  fn: async () => {
    const fixtures = JSON.parse(
      await Deno.readTextFile(fixtureIndex!),
    ) as PathPolicyFixture[];
    const fixture = fixtures.find((item) => item.name === "factory_valid");
    if (!fixture) throw new Error("Pinned factory path fixture is missing.");
    const chain = fixture.certificatesBase64.map((value) =>
      parseX509Certificate(fromBase64(value))
    );
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const signer = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
    const freshRoots = rootMetadata(
      fromBase64(fixture.trustAnchorBase64),
      fixture.validationTimeMs,
    );
    const freshStatus = emptyStatus(fixture.validationTimeMs);
    const common = {
      chain,
      challengeId: "b8f3e5b2-1b5a-4a7e-8a1a-2d0c6f4e9b11",
      proofSignature: new Uint8Array([0x30, 0x00]),
      keyPolicy: {
        expectedChallenge: challenge,
        minimumPackageVersion: 1n,
        signingCertificateSha256: signer,
      },
      validationTimeMs: fixture.validationTimeMs,
    };

    await assertRejects(
      () => verifySupremeAndroidAttestation({
        ...common,
        googleRoots: {
          ...freshRoots,
          expiresAtMs: fixture.validationTimeMs,
        },
        revocationStatus: freshStatus,
      }),
      "Google attestation metadata is stale",
    );
    await assertRejects(
      () => verifySupremeAndroidAttestation({
        ...common,
        googleRoots: freshRoots,
        revocationStatus: {
          ...freshStatus,
          expiresAtMs: fixture.validationTimeMs,
        },
      }),
      "Google attestation metadata is stale",
    );
  },
});

Deno.test("Supreme proof verifier checks a domain-separated signature against imported leaf SPKI", async () => {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey));
  const leaf = {
    subjectPublicKeyAlgorithmOid: "1.2.840.10045.2.1",
    subjectPublicKeyParameters: new Uint8Array([
      0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07,
    ]),
    subjectPublicKeyInfo: spki,
  } as ReturnType<typeof parseX509Certificate>;
  const publicKey = await importSupremeAttestationProofPublicKey(leaf);
  const challengeId = "b8f3e5b2-1b5a-4a7e-8a1a-2d0c6f4e9b11";
  const challenge = Uint8Array.from({ length: 32 }, (_, index) => index + 3);
  const payload = new TextEncoder().encode(
    `NEWEIX-SUPREME-ATTESTATION-V1\n${challengeId}\n${btoa(String.fromCharCode(...challenge)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "")}`,
  );
  const signature = rawEcdsaToDer(new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, pair.privateKey, payload),
  ));
  if (!await verifySupremeChallengeProof(publicKey, challengeId, challenge, signature)) {
    throw new Error("Valid proof-of-possession was rejected.");
  }
  const wrongChallenge = challenge.slice();
  wrongChallenge[0] ^= 0xff;
  if (await verifySupremeChallengeProof(publicKey, challengeId, wrongChallenge, signature)) {
    throw new Error("Proof-of-possession accepted a different server challenge.");
  }
});

type PathPolicyFixture = {
  name: string;
  valid: boolean;
  validationTimeMs: number;
  certificatesBase64: string[];
  trustAnchorBase64: string;
};

Deno.test({
  name: "Google factory no-leaf path is never accepted as a Supreme device",
  ignore: !fixtureIndex,
  fn: async () => {
    const fixtures = JSON.parse(
      await Deno.readTextFile(fixtureIndex!),
    ) as PathPolicyFixture[];
    const fixture = fixtures.find((item) => item.name === "no_leaf");
    if (!fixture) throw new Error("Pinned Google no-leaf path fixture is missing.");
    const chain = fixture.certificatesBase64.map((value) =>
      parseX509Certificate(fromBase64(value))
    );
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    await assertRejects(
      () => verifySupremeAndroidAttestation({
        chain,
        googleRoots: rootMetadata(fromBase64(fixture.trustAnchorBase64), fixture.validationTimeMs),
        revocationStatus: emptyStatus(fixture.validationTimeMs),
        validationTimeMs: fixture.validationTimeMs,
        challengeId: "b8f3e5b2-1b5a-4a7e-8a1a-2d0c6f4e9b11",
        proofSignature: new Uint8Array([0x30, 0x00]),
        keyPolicy: {
          expectedChallenge: challenge,
          minimumPackageVersion: 1n,
          signingCertificateSha256: Uint8Array.from({ length: 32 }, (_, index) => index + 1),
        },
      }),
      "Supreme attestation leaf must contain exactly one non-critical KeyDescription extension",
    );
  },
});

Deno.test({
  name: "Supreme verification pipeline reaches the app policy only after a trusted path",
  ignore: !fixtureIndex,
  fn: async () => {
    const fixtures = JSON.parse(
      await Deno.readTextFile(fixtureIndex!),
    ) as PathPolicyFixture[];
    const fixture = fixtures.find((item) => item.name === "factory_valid");
    if (!fixture) throw new Error("Pinned factory path fixture is missing.");
    const chain = fixture.certificatesBase64.map((value) =>
      parseX509Certificate(fromBase64(value))
    );
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const signer = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
    await assertRejects(
      () => verifySupremeAndroidAttestation({
        chain,
        googleRoots: rootMetadata(fromBase64(fixture.trustAnchorBase64), fixture.validationTimeMs),
        revocationStatus: emptyStatus(fixture.validationTimeMs),
        validationTimeMs: fixture.validationTimeMs,
        challengeId: "b8f3e5b2-1b5a-4a7e-8a1a-2d0c6f4e9b11",
        proofSignature: new Uint8Array([0x30, 0x00]),
        keyPolicy: {
          expectedChallenge: challenge,
          minimumPackageVersion: 1n,
          signingCertificateSha256: signer,
        },
      }),
      "challenge does not match the server challenge",
    );
  },
});
