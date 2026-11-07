import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 96 * 1024;
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

async function readBoundedBody(request: Request): Promise<Uint8Array> {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    if (!/^\d+$/.test(contentLength)) throw new TypeError("Invalid Content-Length.");
    if (Number(contentLength) > MAX_BODY_BYTES) throw new RangeError("Request too large.");
  }
  if (!request.body) throw new TypeError("Missing request body.");

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
        throw new RangeError("Request too large.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

/**
 * Same-origin proxy to the private Supabase Edge Function. The service-role
 * credential is added only server-side and is never returned to the client.
 * The verifier consumes a challenge only after all attestation checks pass;
 * it does not create an Auth session or authorize the Supreme dashboard.
 */
export async function POST(request: Request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) {
    return errorResponse("Content-Type must be application/json.", 415);
  }

  let body: Uint8Array;
  try {
    body = await readBoundedBody(request);
  } catch (error) {
    return errorResponse(
      error instanceof RangeError ? "Attestation request is too large." : "Invalid attestation request body.",
      error instanceof RangeError ? 413 : 400,
    );
  }

  try {
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
      return errorResponse("Attestation verification service is unavailable.", 503);
    }

    const endpoint = `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/supreme-attestation-verify`;
    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
        "Content-Type": "application/json",
      },
      body,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(12_000),
    });

    const responseText = await upstream.text();
    if (responseText.length > 8 * 1024) {
      return errorResponse("Attestation verification service returned an invalid response.", 502);
    }

    if (!upstream.ok && upstream.status >= 500) {
      return errorResponse("Attestation verification service is temporarily unavailable.", 503);
    }

    return new NextResponse(responseText, {
      status: upstream.status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        ...NO_STORE_HEADERS,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return errorResponse("Attestation verification service is temporarily unavailable.", 503);
  }
}
