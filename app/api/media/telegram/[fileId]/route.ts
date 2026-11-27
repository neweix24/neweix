import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ fileId: string }> };

async function constantTimeMatch(a: string, b: string): Promise<boolean> {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function signFileId(fileId: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(fileId));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function GET(request: Request, context: RouteContext) {
  const { fileId } = await context.params;
  if (!fileId || fileId.length > 512 || !/^[A-Za-z0-9_-]+$/.test(fileId)) {
    return NextResponse.json({ error: "INVALID_FILE_ID" }, { status: 400 });
  }

  const { env } = await getCloudflareContext({ async: true });
  const secrets = env as Record<string, string | undefined>;
  const token = secrets.TELEGRAM_BOT_TOKEN;
  const signingSecret = secrets.NEWEIX_MEDIA_UPLOAD_SECRET;
  if (!token || !signingSecret) {
    return NextResponse.json({ error: "MEDIA_STORAGE_NOT_CONFIGURED" }, { status: 503 });
  }

  const suppliedSignature = new URL(request.url).searchParams.get("sig") ?? "";
  const expectedSignature = await signFileId(fileId, signingSecret);
  if (!/^[a-f0-9]{64}$/.test(suppliedSignature) || !(await constantTimeMatch(suppliedSignature, expectedSignature))) {
    return NextResponse.json({ error: "INVALID_MEDIA_SIGNATURE" }, { status: 403 });
  }

  let metadataResponse: Response;
  try {
    metadataResponse = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`, {
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    return NextResponse.json({ error: "TELEGRAM_UNAVAILABLE" }, { status: 502 });
  }

  const metadata = await metadataResponse.json().catch(() => null) as {
    ok?: boolean;
    result?: { file_path?: string; file_size?: number };
  } | null;

  const filePath = metadata?.result?.file_path;
  if (!metadataResponse.ok || !metadata?.ok || !filePath || filePath.startsWith("/") || filePath.includes("..")) {
    return NextResponse.json({ error: "TELEGRAM_FILE_NOT_FOUND" }, { status: 404 });
  }

  let imageResponse: Response;
  try {
    imageResponse = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`, {
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return NextResponse.json({ error: "TELEGRAM_FILE_UNAVAILABLE" }, { status: 502 });
  }

  if (!imageResponse.ok || !imageResponse.body) {
    return NextResponse.json({ error: "TELEGRAM_FILE_UNAVAILABLE" }, { status: 502 });
  }

  const contentType = imageResponse.headers.get("content-type") ?? "application/octet-stream";
  if (!/^image\/(jpeg|png|webp|gif)$/.test(contentType)) {
    return NextResponse.json({ error: "UNEXPECTED_MEDIA_TYPE" }, { status: 502 });
  }

  return new Response(imageResponse.body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
      "X-Content-Type-Options": "nosniff",
      "Vary": "Accept-Encoding",
    },
  });
}
