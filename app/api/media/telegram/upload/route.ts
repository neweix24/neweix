import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const dynamic = "force-dynamic";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

async function constantTimeMatch(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(a)),
    crypto.subtle.digest("SHA-256", encoder.encode(b)),
  ]);
  const x = new Uint8Array(left);
  const y = new Uint8Array(right);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
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

export async function POST(request: Request) {
  const { env } = await getCloudflareContext({ async: true });
  const secrets = env as Record<string, string | undefined>;
  const token = secrets.TELEGRAM_BOT_TOKEN;
  const chatId = secrets.TELEGRAM_MEDIA_CHAT_ID;
  const uploadSecret = secrets.NEWEIX_MEDIA_UPLOAD_SECRET;

  if (!token || !chatId || !uploadSecret) {
    return NextResponse.json({ error: "MEDIA_STORAGE_NOT_CONFIGURED" }, { status: 503 });
  }

  const authorization = request.headers.get("authorization") ?? "";
  const suppliedSecret = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!suppliedSecret || !(await constantTimeMatch(suppliedSecret, uploadSecret))) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_IMAGE_BYTES + 64 * 1024) {
    return NextResponse.json({ error: "IMAGE_TOO_LARGE" }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "INVALID_MULTIPART_BODY" }, { status: 400 });
  }

  const image = form.get("image");
  if (!(image instanceof File)) {
    return NextResponse.json({ error: "IMAGE_REQUIRED" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(image.type)) {
    return NextResponse.json({ error: "UNSUPPORTED_IMAGE_TYPE" }, { status: 415 });
  }
  if (image.size === 0 || image.size > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "IMAGE_SIZE_OUT_OF_RANGE" }, { status: 413 });
  }

  const telegramForm = new FormData();
  telegramForm.set("chat_id", chatId);
  telegramForm.set("photo", image, image.name || "upload");
  const caption = form.get("caption");
  if (typeof caption === "string" && caption.trim()) {
    telegramForm.set("caption", caption.trim().slice(0, 1024));
  }

  let telegramResponse: Response;
  try {
    telegramResponse = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
      method: "POST",
      body: telegramForm,
      signal: AbortSignal.timeout(25_000),
    });
  } catch {
    return NextResponse.json({ error: "TELEGRAM_UNAVAILABLE" }, { status: 502 });
  }

  const payload = await telegramResponse.json().catch(() => null) as {
    ok?: boolean;
    description?: string;
    result?: { message_id?: number; photo?: Array<{ file_id: string; file_unique_id: string; file_size?: number }> };
  } | null;

  if (!telegramResponse.ok || !payload?.ok || !payload.result?.photo?.length) {
    return NextResponse.json({
      error: "TELEGRAM_UPLOAD_FAILED",
      telegram_status: telegramResponse.status,
      reason: payload?.description ?? "Unexpected Telegram response",
    }, { status: 502 });
  }

  const photo = payload.result.photo[payload.result.photo.length - 1];
  const signature = await signFileId(photo.file_id, uploadSecret);
  return NextResponse.json({
    ok: true,
    provider: "telegram",
    message_id: payload.result.message_id,
    file_id: photo.file_id,
    file_unique_id: photo.file_unique_id,
    file_size: photo.file_size ?? image.size,
    mime_type: image.type,
    display_url: `/api/media/telegram/${encodeURIComponent(photo.file_id)}?sig=${signature}`,
  }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
