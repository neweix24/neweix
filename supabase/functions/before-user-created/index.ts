const MAX_BODY_BYTES = 64 * 1024;
const MAX_SKEW_SECONDS = 300;

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function decodeBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function safeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

async function verifySignature(rawBody: string, headers: Headers, secretValue: string) {
  const id = headers.get("webhook-id");
  const timestamp = headers.get("webhook-timestamp");
  const signatureHeader = headers.get("webhook-signature");
  if (!id || !timestamp || !signatureHeader || !/^\d+$/.test(timestamp)) return false;

  const timestampSeconds = Number(timestamp);
  if (!Number.isSafeInteger(timestampSeconds) ||
      Math.abs(Date.now() / 1000 - timestampSeconds) > MAX_SKEW_SECONDS) return false;

  const prefix = "v1,whsec_";
  if (!secretValue.startsWith(prefix)) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    decodeBase64(secretValue.slice(prefix.length)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signedContent = new TextEncoder().encode(`${id}.${timestamp}.${rawBody}`);
  const expected = new Uint8Array(await crypto.subtle.sign("HMAC", key, signedContent));

  return signatureHeader.split(" ").some((part) => {
    const [version, encoded] = part.split(",");
    if (version !== "v1" || !encoded) return false;
    try {
      return safeEqual(expected, decodeBase64(encoded));
    } catch {
      return false;
    }
  });
}

function deny(message: string, status = 403): Response {
  return response({ error: { http_code: status, message } }, status);
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return response({ error: "Method not allowed" }, 405);

  const hookSecret = Deno.env.get("BEFORE_USER_CREATED_HOOK_SECRET");
  if (!hookSecret) {
    console.error("Missing BEFORE_USER_CREATED_HOOK_SECRET");
    return deny("নিরাপত্তা যাচাই সাময়িকভাবে অনুপলব্ধ। পরে আবার চেষ্টা করুন।", 500);
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_BODY_BYTES) return response({ error: "Payload too large" }, 413);

  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).length > MAX_BODY_BYTES) {
    return response({ error: "Payload too large" }, 413);
  }

  let verified = false;
  try {
    verified = await verifySignature(rawBody, request.headers, hookSecret);
  } catch {
    verified = false;
  }
  if (!verified) return response({ error: "Invalid webhook signature" }, 401);

  let event: { metadata?: { name?: string } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return deny("Invalid signup event.", 400);
  }

  if (event.metadata?.name !== "before-user-created") {
    return deny("Unsupported authentication event.", 400);
  }

  // Global access policy: do not restrict signup by country, IP geolocation,
  // VPN, proxy, Tor, relay, or hosting-provider classification.
  // Supabase's signed webhook authentication remains mandatory.
  return response({});
});
