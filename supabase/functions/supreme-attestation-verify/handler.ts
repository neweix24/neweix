import { decodeSupremeChallenge } from "../_shared/supreme-attestation-proof.ts";
import type {
  SupremeAttestationVerificationInput,
  SupremeAttestationVerificationResult,
} from "../_shared/supreme-attestation-verifier.ts";
import type { ParsedX509Certificate } from "../_shared/supreme-x509-certificate.ts";
import type {
  GoogleAttestationRoots,
  GoogleAttestationStatus,
} from "../_shared/supreme-google-attestation-metadata.ts";

const MAX_BODY_BYTES = 96 * 1024;
const MAX_CHAIN_CERTIFICATES = 10;
const MIN_CHAIN_CERTIFICATES = 3;
const MAX_CERTIFICATE_DER_BYTES = 12 * 1024;
const MAX_TOTAL_CHAIN_DER_BYTES = 64 * 1024;
const MAX_PROOF_SIGNATURE_DER_BYTES = 128;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export type SupremeAttestationVerifyDependencies = {
  serviceRoleKey: string | null;
  signingCertificateSha256: string | null;
  minimumPackageVersion: string | null;
  fetchMetadata: () => Promise<{
    roots: GoogleAttestationRoots;
    status: GoogleAttestationStatus;
  }>;
  parseCertificate: (der: Uint8Array) => ParsedX509Certificate;
  verifyAttestation: (
    input: SupremeAttestationVerificationInput,
  ) => Promise<SupremeAttestationVerificationResult>;
  assertChallengeAvailable: (
    challengeId: string,
    challengeHash: string,
  ) => Promise<boolean>;
  consumeChallenge: (
    challengeId: string,
    challengeHash: string,
  ) => Promise<boolean>;
};

type VerifyPayload = {
  challenge_id: string;
  challenge: string;
  certificate_chain: string[];
  proof_signature: string;
};

type ParsedPayload = {
  challengeId: string;
  challenge: Uint8Array;
  chain: ParsedX509Certificate[];
  proofSignature: Uint8Array;
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "private, no-store, max-age=0",
      pragma: "no-cache",
      "x-content-type-options": "nosniff",
    },
  });
}

async function readBoundedBody(request: Request): Promise<string> {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    if (!/^\d+$/.test(contentLength)) {
      throw new TypeError("Invalid Content-Length.");
    }
    if (Number(contentLength) > MAX_BODY_BYTES) {
      throw new RangeError("Attestation request is too large.");
    }
  }

  if (!request.body) throw new TypeError("Attestation request body is empty.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new RangeError("Attestation request is too large.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function decodeCanonicalBase64(value: unknown, label: string, maxBytes: number): Uint8Array {
  if (typeof value !== "string" || value.length === 0 || value.length > Math.ceil(maxBytes * 4 / 3) + 4 || !BASE64.test(value)) {
    throw new TypeError(`Invalid ${label} Base64.`);
  }
  const binary = atob(value);
  if (binary.length === 0 || binary.length > maxBytes || btoa(binary) !== value) {
    throw new TypeError(`Invalid ${label} Base64.`);
  }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function parsePayload(value: unknown, parseCertificate: (der: Uint8Array) => ParsedX509Certificate): ParsedPayload {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Attestation payload must be a JSON object.");
  }
  const object = value as Record<string, unknown>;
  const allowedKeys = new Set([
    "challenge_id",
    "challenge",
    "certificate_chain",
    "proof_signature",
  ]);
  if (Object.keys(object).some((key) => !allowedKeys.has(key)) || Object.keys(object).length !== 4) {
    throw new TypeError("Attestation payload has missing or unknown fields.");
  }

  if (typeof object.challenge_id !== "string" || !UUID_V4.test(object.challenge_id)) {
    throw new TypeError("Invalid attestation challenge ID.");
  }
  if (typeof object.challenge !== "string") {
    throw new TypeError("Invalid attestation challenge.");
  }
  const challenge = decodeSupremeChallenge(object.challenge);

  if (
    !Array.isArray(object.certificate_chain) ||
    object.certificate_chain.length < MIN_CHAIN_CERTIFICATES ||
    object.certificate_chain.length > MAX_CHAIN_CERTIFICATES
  ) {
    throw new TypeError("Android attestation certificate chain has an invalid length.");
  }

  const chainBytes = object.certificate_chain.map((certificate, index) =>
    decodeCanonicalBase64(certificate, `certificate ${index}`, MAX_CERTIFICATE_DER_BYTES)
  );
  const totalChainBytes = chainBytes.reduce((total, certificate) => total + certificate.length, 0);
  if (totalChainBytes > MAX_TOTAL_CHAIN_DER_BYTES) {
    throw new RangeError("Android attestation certificate chain is too large.");
  }
  const chain = chainBytes.map(parseCertificate);

  const proofSignature = decodeCanonicalBase64(
    object.proof_signature,
    "proof signature",
    MAX_PROOF_SIGNATURE_DER_BYTES,
  );

  return {
    challengeId: object.challenge_id,
    challenge,
    chain,
    proofSignature,
  };
}

function parseSha256Hex(value: string): Uint8Array {
  if (!/^[a-f0-9]{64}$/i.test(value)) {
    throw new TypeError("Supreme production APK signer digest is not configured correctly.");
  }
  return Uint8Array.from(
    value.match(/.{2}/gu) ?? [],
    (byte) => Number.parseInt(byte, 16),
  );
}

async function sha256Hex(value: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", value));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function isServiceRoleRequest(request: Request, serviceRoleKey: string): boolean {
  return request.headers.get("authorization") === `Bearer ${serviceRoleKey}` &&
    request.headers.get("apikey") === serviceRoleKey;
}

/**
 * Server-to-server attestation verification. This endpoint consumes a challenge
 * only after certificate path, Google revocation, Android key policy and proof
 * of possession all pass. It never creates a Supabase session or grants a role.
 */
export async function handleSupremeAttestationVerify(
  request: Request,
  dependencies: SupremeAttestationVerifyDependencies,
): Promise<Response> {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  if (!dependencies.serviceRoleKey) {
    return json({ error: "Attestation verifier is not configured." }, 503);
  }
  if (!isServiceRoleRequest(request, dependencies.serviceRoleKey)) {
    return json({ error: "Unauthorized." }, 401);
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
    return json({ error: "Content-Type must be application/json." }, 415);
  }

  let rawBody: string;
  try {
    rawBody = await readBoundedBody(request);
  } catch (error) {
    return json(
      { error: error instanceof RangeError ? "Attestation request is too large." : "Invalid attestation request body." },
      error instanceof RangeError ? 413 : 400,
    );
  }

  let rawPayload: unknown;
  try {
    rawPayload = JSON.parse(rawBody);
  } catch {
    return json({ error: "Malformed attestation JSON." }, 400);
  }

  let payload: ParsedPayload;
  try {
    payload = parsePayload(rawPayload, dependencies.parseCertificate);
  } catch {
    return json({ error: "Malformed Android attestation payload." }, 400);
  }

  if (
    !dependencies.signingCertificateSha256 ||
    !dependencies.minimumPackageVersion ||
    !/^[1-9]\d{0,9}$/.test(dependencies.minimumPackageVersion)
  ) {
    return json({ error: "Supreme production app identity is not configured." }, 503);
  }

  let signingCertificateSha256: Uint8Array;
  let minimumPackageVersion: bigint;
  try {
    signingCertificateSha256 = parseSha256Hex(dependencies.signingCertificateSha256);
    minimumPackageVersion = BigInt(dependencies.minimumPackageVersion);
  } catch {
    return json({ error: "Supreme production app identity is not configured." }, 503);
  }

  let challengeHash: string;
  try {
    challengeHash = await sha256Hex(payload.challenge);
    const challengeAvailable = await dependencies.assertChallengeAvailable(
      payload.challengeId,
      challengeHash,
    );
    if (!challengeAvailable) {
      return json({ error: "Attestation challenge expired, mismatched or already used." }, 409);
    }
  } catch {
    return json({ error: "Attestation challenge service is unavailable." }, 503);
  }

  let metadata: { roots: GoogleAttestationRoots; status: GoogleAttestationStatus };
  try {
    metadata = await dependencies.fetchMetadata();
  } catch {
    return json({ error: "Google Android attestation trust data is unavailable." }, 503);
  }

  let verification: SupremeAttestationVerificationResult;
  try {
    verification = await dependencies.verifyAttestation({
      chain: payload.chain,
      googleRoots: metadata.roots,
      revocationStatus: metadata.status,
      challengeId: payload.challengeId,
      proofSignature: payload.proofSignature,
      keyPolicy: {
        expectedChallenge: payload.challenge,
        minimumPackageVersion,
        signingCertificateSha256,
      },
    });
  } catch {
    return json({ error: "Android device attestation was rejected." }, 403);
  }

  let consumed: boolean;
  try {
    consumed = await dependencies.consumeChallenge(payload.challengeId, challengeHash);
  } catch {
    return json({ error: "Attestation replay protection is unavailable." }, 503);
  }
  if (!consumed) {
    return json({ error: "Attestation challenge expired or was already used." }, 409);
  }

  return json({
    verified: true,
    security_level: verification.keyPolicy.securityLevel,
    provisioning_method: verification.chain.provisioningMethod,
    proof_of_possession_verified: verification.proofOfPossessionVerified,
  }, 200);
}
