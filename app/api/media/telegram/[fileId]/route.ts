import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ fileId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { fileId } = await context.params;
  if (!fileId || fileId.length > 512 || !/^[A-Za-z0-9_-]+$/.test(fileId)) {
    return NextResponse.json({ error: "INVALID_FILE_ID" }, { status: 400 });
  }

  const { env } = await getCloudflareContext({ async: true });
  const token = (env as Record<string, string | undefined>).TELEGRAM_BOT_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "MEDIA_STORAGE_NOT_CONFIGURED" }, { status: 503 });
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
    description?: string;
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
  if (!contentType.startsWith("image/")) {
    return NextResponse.json({ error: "UNEXPECTED_MEDIA_TYPE" }, { status: 502 });
  }

  return new Response(imageResponse.body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
