import { NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "Pragma": "no-cache",
};

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, {
    status,
    headers: NO_STORE_HEADERS,
  });
}

function toBase64Url(value: Buffer): string {
  return value.toString("base64url");
}

export async function POST(request: Request) {
  try {
    // Cloudflare supplies this header at the edge. Do not accept a client-
    // supplied X-Forwarded-For value as the rate-limit identity.
    const sourceIp = request.headers.get("cf-connecting-ip")?.trim();
    if (!sourceIp || sourceIp.length > 64) {
      return errorResponse("Attestation challenge service is unavailable.", 503);
    }

    // This endpoint only issues a short-lived nonce. It does not authenticate
    // the caller or grant Supreme access.
    const { env } = await getCloudflareContext();
    const runtimeEnv = env as Record<string, unknown>;
    const supabaseUrl =
      runtimeEnv.NEXT_PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey =
      runtimeEnv.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (
      typeof supabaseUrl !== "string" || !supabaseUrl ||
      typeof serviceRoleKey !== "string" || !serviceRoleKey
    ) {
      return errorResponse("Attestation challenge service is unavailable.", 503);
    }

    const challenge = randomBytes(32);
    const challengeHash = createHash("sha256").update(challenge).digest("hex");
    const requesterIpHash = createHash("sha256").update(sourceIp).digest("hex");
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: challengeId, error } = await serviceClient.rpc(
      "issue_supreme_app_attestation_challenge",
      {
        p_challenge_hash: challengeHash,
        p_requester_ip_hash: requesterIpHash,
        p_expires_at: expiresAt,
      },
    );

    if (error) {
      console.error("Supreme attestation challenge issuance failed:", error.message);
      return errorResponse("Attestation challenge service is unavailable.", 503);
    }

    if (typeof challengeId !== "string") {
      return errorResponse("Too many attestation attempts. Try again later.", 429);
    }

    return NextResponse.json({
      success: true,
      challenge_id: challengeId,
      challenge: toBase64Url(challenge),
      expires_at: expiresAt,
    }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error("Supreme attestation challenge failed:", error);
    return errorResponse("Attestation challenge service is unavailable.", 503);
  }
}
