const MAX_BODY_BYTES = 64 * 1024;
const MAX_SKEW_SECONDS = 300;
const IPLOGS_URL = "https://iplogs.com/v1/check";

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

function isPublicIp(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 45) return false;
  if (!/^[0-9a-fA-F:.]+$/.test(value)) return false;
  if (!(value.includes(".") || value.includes(":"))) return false;
  if (value.startsWith("127.") || value.startsWith("10.") ||
      value.startsWith("192.168.") || value.startsWith("169.254.") ||
      value === "::1" || value === "::") return false;
  return true;
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

  let event: {
    metadata?: { name?: string; ip_address?: unknown };
    user?: { id?: string; app_metadata?: { provider?: string } };
  };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return deny("Invalid signup event.", 400);
  }

  if (event.metadata?.name !== "before-user-created") {
    return deny("Unsupported authentication event.", 400);
  }

  const ip = event.metadata?.ip_address;
  if (!isPublicIp(ip)) {
    return deny("বাংলাদেশের নেটওয়ার্ক থেকে সাইনআপ করতে হবে। IP যাচাই করা যায়নি।");
  }

  async function checkIp(mode: "full" | "fast", budgetMs: number) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), budgetMs);
    try {
      const upstream = await fetch(IPLOGS_URL, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(mode === "fast" ? { ip, mode: "fast" } : { ip }),
        signal: controller.signal,
      });
      if (!upstream.ok) {
        console.error("IPLogs check failed with status:", upstream.status);
        return null;
      }
      return await upstream.json() as {
        score?: unknown;
        verdict?: unknown;
        is_vpn?: unknown;
        is_proxy?: unknown;
        is_tor?: unknown;
        is_relay?: unknown;
        is_hosting?: unknown;
        mode?: unknown;
        ip_info?: { country_code?: unknown };
        request_id?: unknown;
      };
    } catch (error) {
      console.warn("IPLogs check unavailable:", mode, error instanceof Error ? error.name : "unknown");
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  // Use the documented full IP check only; do not substitute a weaker fast result.
  const result = await checkIp("full", 4_000);

  if (!result) {
    return deny("নেটওয়ার্ক নিরাপত্তা যাচাই সাময়িকভাবে অনুপলব্ধ। পরে আবার চেষ্টা করুন।", 500);
  }

  const country = result.ip_info?.country_code;
  if (typeof country !== "string" || country.toUpperCase() !== "BD") {
    console.info("Signup denied by country policy.", {
      country: typeof country === "string" ? country : "unknown",
    });
    return deny("NEWEIX-এ অ্যাকাউন্ট খুলতে বাংলাদেশের ইন্টারনেট সংযোগ ব্যবহার করতে হবে।");
  }

  const score = typeof result.score === "number" ? result.score : 1;
  const vpnRisk = result.is_vpn === true || result.is_proxy === true ||
    result.is_tor === true || result.is_relay === true || score >= 0.6;

  if (vpnRisk) {
    console.info("Signup denied by network-risk policy.", {
      verdict: typeof result.verdict === "string" ? result.verdict : "unknown",
      score,
      mode: typeof result.mode === "string" ? result.mode : "full",
      tor: result.is_tor === true,
      relay: result.is_relay === true,
      hosting: result.is_hosting === true,
    });
    return deny("VPN, Proxy, Tor বা Privacy Relay বন্ধ করে বাংলাদেশের স্বাভাবিক মোবাইল/ইন্টারনেট নেটওয়ার্ক দিয়ে আবার চেষ্টা করুন।");
  }

  return response({});
});
