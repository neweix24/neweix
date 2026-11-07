import { fetchGoogleAttestationMetadata } from "../_shared/supreme-google-attestation-metadata.ts";
import { parseX509Certificate } from "../_shared/supreme-x509-certificate.ts";
import { verifySupremeAndroidAttestation } from "../_shared/supreme-attestation-verifier.ts";
import { handleSupremeAttestationVerify } from "./handler.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function restHeaders(): HeadersInit {
  return {
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`,
    "content-type": "application/json",
  };
}

async function assertChallengeAvailable(
  challengeId: string,
  challengeHash: string,
  requesterIpHash: string,
): Promise<boolean> {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase server credentials are unavailable.");
  }

  // This is an atomic reservation, not a read-only lookup. The database
  // permits at most three concurrent/repeated verification attempts per
  // challenge and enforces the original requester IP binding.
  const response = await fetch(
    new URL("/rest/v1/rpc/reserve_supreme_app_attestation_verification_attempt", supabaseUrl),
    {
      method: "POST",
      headers: restHeaders(),
      body: JSON.stringify({
        p_challenge_id: challengeId,
        p_challenge_hash: challengeHash,
        p_requester_ip_hash: requesterIpHash,
      }),
      redirect: "error",
      signal: AbortSignal.timeout(5_000),
    },
  );
  if (!response.ok) throw new Error("Challenge attempt reservation failed.");
  return await response.json() === true;
}

async function consumeChallenge(
  challengeId: string,
  challengeHash: string,
): Promise<boolean> {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase server credentials are unavailable.");
  }

  const response = await fetch(
    new URL("/rest/v1/rpc/consume_supreme_app_attestation_challenge", supabaseUrl),
    {
      method: "POST",
      headers: restHeaders(),
      body: JSON.stringify({
        p_challenge_id: challengeId,
        p_challenge_hash: challengeHash,
      }),
      redirect: "error",
      signal: AbortSignal.timeout(5_000),
    },
  );
  if (!response.ok) throw new Error("Challenge consumption failed.");
  return await response.json() === true;
}

Deno.serve((request) =>
  handleSupremeAttestationVerify(request, {
    serviceRoleKey: serviceRoleKey || null,
    signingCertificateSha256: Deno.env.get("SUPREME_ANDROID_SIGNING_CERT_SHA256") ?? null,
    minimumPackageVersion: Deno.env.get("SUPREME_ANDROID_MIN_VERSION_CODE") ?? null,
    fetchMetadata: fetchGoogleAttestationMetadata,
    parseCertificate: parseX509Certificate,
    verifyAttestation: verifySupremeAndroidAttestation,
    assertChallengeAvailable,
    consumeChallenge,
  })
);
