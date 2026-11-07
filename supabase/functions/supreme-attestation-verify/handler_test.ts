import {
  encodeSupremeChallenge,
} from "../_shared/supreme-attestation-proof.ts";
import type {
  SupremeAttestationVerificationInput,
  SupremeAttestationVerificationResult,
} from "../_shared/supreme-attestation-verifier.ts";
import type { ParsedX509Certificate } from "../_shared/supreme-x509-certificate.ts";
import type {
  GoogleAttestationRoots,
  GoogleAttestationStatus,
} from "../_shared/supreme-google-attestation-metadata.ts";
import {
  handleSupremeAttestationVerify,
  type SupremeAttestationVerifyDependencies,
} from "./handler.ts";

const CHALLENGE_ID = "b8f3e5b2-1b5a-4a7e-8a1a-2d0c6f4e9b11";
const SERVICE_ROLE_KEY = "server-only-test-service-role-key";
const challenge = new Uint8Array(32).fill(7);
const encodedChallenge = encodeSupremeChallenge(challenge);
const fakeCertificate = {} as ParsedX509Certificate;
const fakeChain = [fakeCertificate, fakeCertificate, fakeCertificate];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) throw new Error(`${message}: expected ${String(expected)}, received ${String(actual)}`);
}

function metadata(): { roots: GoogleAttestationRoots; status: GoogleAttestationStatus } {
  const now = Date.now();
  return {
    roots: {
      certificatesPem: [],
      fetchedAtMs: now - 1_000,
      expiresAtMs: now + 60_000,
      maxAgeSeconds: 61,
    },
    status: {
      entries: new Map(),
      fetchedAtMs: now - 1_000,
      expiresAtMs: now + 60_000,
      maxAgeSeconds: 61,
    },
  };
}

function verificationResult(): SupremeAttestationVerificationResult {
  return {
    chain: {
      trustAnchorMatched: true,
      provisioningMethod: "FACTORY_PROVISIONED",
      provisioningInfo: null,
      chainRolesValidated: 2,
      validityCertificatesChecked: 3,
      signatureLinksVerified: 2,
      revocationEntriesChecked: 2,
    },
    keyPolicy: {
      packageName: "com.neweix.supreme",
      minimumPackageVersion: 2n,
      securityLevel: "TRUSTED_ENVIRONMENT",
      keyAlgorithm: "EC",
      keySizeBits: 256,
      curve: "P-256",
      origin: "GENERATED",
      purpose: "SIGN_AND_VERIFY",
      digest: "SHA-256",
      deviceLocked: true,
      verifiedBootState: "VERIFIED",
    },
    proofOfPossessionVerified: true,
  };
}

function validPayload() {
  return {
    challenge_id: CHALLENGE_ID,
    challenge: encodedChallenge,
    certificate_chain: [btoa("\x30\x00"), btoa("\x30\x00"), btoa("\x30\x00")],
    proof_signature: btoa("\x30\x00"),
  };
}

function makeRequest(
  body: unknown = validPayload(),
  overrides: { method?: string; authorization?: string; apikey?: string; contentType?: string; contentLength?: string } = {},
): Request {
  const headers = new Headers({
    authorization: overrides.authorization ?? `Bearer ${SERVICE_ROLE_KEY}`,
    apikey: overrides.apikey ?? SERVICE_ROLE_KEY,
    "content-type": overrides.contentType ?? "application/json",
  });
  if (overrides.contentLength !== undefined) headers.set("content-length", overrides.contentLength);
  return new Request("https://neweix.com/api/supreme/attestation/verify", {
    method: overrides.method ?? "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function makeDependencies(
  overrides: Partial<SupremeAttestationVerifyDependencies> = {},
  calls: string[] = [],
): SupremeAttestationVerifyDependencies {
  return {
    serviceRoleKey: SERVICE_ROLE_KEY,
    signingCertificateSha256: "ab".repeat(32),
    minimumPackageVersion: "2",
    fetchMetadata: async () => {
      calls.push("metadata");
      return metadata();
    },
    parseCertificate: () => fakeCertificate,
    verifyAttestation: async (_input: SupremeAttestationVerificationInput) => {
      calls.push("verify");
      return verificationResult();
    },
    assertChallengeAvailable: async () => {
      calls.push("challenge-available");
      return true;
    },
    consumeChallenge: async () => {
      calls.push("consume");
      return true;
    },
    ...overrides,
  };
}

async function responseBody(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>;
}

Deno.test("valid request verifies cryptography before atomically consuming the challenge", async () => {
  const calls: string[] = [];
  const response = await handleSupremeAttestationVerify(
    makeRequest(),
    makeDependencies({}, calls),
  );
  const body = await responseBody(response);
  assertEquals(response.status, 200, "valid status");
  assertEquals(body.verified, true, "verification result");
  assertEquals(body.security_level, "TRUSTED_ENVIRONMENT", "hardware security level");
  assertEquals(body.provisioning_method, "FACTORY_PROVISIONED", "provisioning method");
  assertEquals(calls.join(","), "challenge-available,metadata,verify,consume", "security gate order");
});

Deno.test("Supabase service-role authentication is mandatory", async () => {
  const response = await handleSupremeAttestationVerify(
    makeRequest(validPayload(), { authorization: "Bearer client-token" }),
    makeDependencies(),
  );
  assertEquals(response.status, 401, "unauthorized status");
});

Deno.test("function fails closed when the service credential is missing", async () => {
  const response = await handleSupremeAttestationVerify(
    makeRequest(),
    makeDependencies({ serviceRoleKey: null }),
  );
  assertEquals(response.status, 503, "missing service key status");
});

Deno.test("production signer identity must be configured before verification", async () => {
  const calls: string[] = [];
  const response = await handleSupremeAttestationVerify(
    makeRequest(),
    makeDependencies({ signingCertificateSha256: null }, calls),
  );
  assertEquals(response.status, 503, "missing signer status");
  assertEquals(calls.length, 0, "no verification work before signer config");
});

Deno.test("malformed JSON, challenge and certificate encodings are rejected", async () => {
  const malformedJson = await handleSupremeAttestationVerify(
    makeRequest("{"),
    makeDependencies(),
  );
  assertEquals(malformedJson.status, 400, "malformed JSON status");

  const malformedChallenge = await handleSupremeAttestationVerify(
    makeRequest({ ...validPayload(), challenge: "A".repeat(43) }),
    makeDependencies(),
  );
  assertEquals(malformedChallenge.status, 400, "malformed challenge status");

  const malformedCertificate = await handleSupremeAttestationVerify(
    makeRequest({ ...validPayload(), certificate_chain: ["not-base64", "AA==", "AA=="] }),
    makeDependencies(),
  );
  assertEquals(malformedCertificate.status, 400, "malformed certificate status");
});

Deno.test("body size, content type and HTTP method are bounded", async () => {
  const tooLarge = await handleSupremeAttestationVerify(
    makeRequest("x".repeat(100_000), { contentLength: "100000" }),
    makeDependencies(),
  );
  assertEquals(tooLarge.status, 413, "oversized request status");

  const wrongType = await handleSupremeAttestationVerify(
    makeRequest(validPayload(), { contentType: "text/plain" }),
    makeDependencies(),
  );
  assertEquals(wrongType.status, 415, "content type status");

  const wrongMethod = await handleSupremeAttestationVerify(
    makeRequest(undefined, { method: "GET" }),
    makeDependencies(),
  );
  assertEquals(wrongMethod.status, 405, "method status");
});

Deno.test("unknown fields and invalid certificate-chain sizes are rejected", async () => {
  const extraField = await handleSupremeAttestationVerify(
    makeRequest({ ...validPayload(), debug: true }),
    makeDependencies(),
  );
  assertEquals(extraField.status, 400, "unknown field status");

  const shortChain = await handleSupremeAttestationVerify(
    makeRequest({ ...validPayload(), certificate_chain: [btoa("\x30\x00")] }),
    makeDependencies(),
  );
  assertEquals(shortChain.status, 400, "short chain status");
});

Deno.test("challenge availability is checked before metadata fetch and expensive verification", async () => {
  const calls: string[] = [];
  const response = await handleSupremeAttestationVerify(
    makeRequest(),
    makeDependencies({
      assertChallengeAvailable: async () => {
        calls.push("challenge-available");
        return false;
      },
    }, calls),
  );
  assertEquals(response.status, 409, "unavailable challenge status");
  assertEquals(calls.join(","), "challenge-available", "no expensive work for unavailable challenge");
});

Deno.test("failed cryptographic verification never consumes a challenge", async () => {
  const calls: string[] = [];
  const response = await handleSupremeAttestationVerify(
    makeRequest(),
    makeDependencies({
      verifyAttestation: async () => {
        calls.push("verify");
        throw new Error("invalid certificate chain");
      },
    }, calls),
  );
  assertEquals(response.status, 403, "invalid attestation status");
  assertEquals(calls.join(","), "challenge-available,metadata,verify", "failed verification must not consume");
});

Deno.test("challenge is rejected if another request already consumed it", async () => {
  const calls: string[] = [];
  const response = await handleSupremeAttestationVerify(
    makeRequest(),
    makeDependencies({
      consumeChallenge: async () => {
        calls.push("consume");
        return false;
      },
    }, calls),
  );
  assertEquals(response.status, 409, "replayed challenge status");
});

Deno.test("challenge service and Google metadata failures fail closed", async () => {
  const challengeFailure = await handleSupremeAttestationVerify(
    makeRequest(),
    makeDependencies({
      assertChallengeAvailable: async () => {
        throw new Error("database unavailable");
      },
    }),
  );
  assertEquals(challengeFailure.status, 503, "challenge service status");

  const metadataFailure = await handleSupremeAttestationVerify(
    makeRequest(),
    makeDependencies({
      fetchMetadata: async () => {
        throw new Error("Google unreachable");
      },
    }),
  );
  assertEquals(metadataFailure.status, 503, "metadata service status");

  const consumeFailure = await handleSupremeAttestationVerify(
    makeRequest(),
    makeDependencies({
      consumeChallenge: async () => {
        throw new Error("database unavailable");
      },
    }),
  );
  assertEquals(consumeFailure.status, 503, "challenge consumption status");
});
