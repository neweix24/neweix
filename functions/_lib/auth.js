const enc = new TextEncoder();

function toB64url(bytes) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(str) {
  let s = str.replace(/-/g, "+").replace(/_/g, "/");
  s += "=".repeat((4 - (s.length % 4)) % 4);
  return Uint8Array.from(atob(s), c => c.charCodeAt(0));
}

function hmacKey(secret, usage) {
  return crypto.subtle.importKey(
    "raw", enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, usage
  );
}

export async function createToken(env, username) {
  const payload = toB64url(enc.encode(JSON.stringify({
    username,
    expires: Date.now() + 8 * 60 * 60 * 1000
  })));
  const key = await hmacKey(env.SESSION_SECRET, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return payload + "." + toB64url(new Uint8Array(sig));
}

export async function verifyAdmin(request, env) {
  try {
    if (!env.SESSION_SECRET) return false;
    const match = (request.headers.get("Cookie") || "")
      .match(/(?:^|;\s*)neweix_admin=([^;]+)/);
    if (!match) return false;

    const parts = match[1].split(".");
    if (parts.length !== 2) return false;
    const [payload, sig] = parts;

    const key = await hmacKey(env.SESSION_SECRET, ["verify"]);
    const ok = await crypto.subtle.verify(
      "HMAC", key, fromB64url(sig), enc.encode(payload)
    );
    if (!ok) return false;

    const s = JSON.parse(new TextDecoder().decode(fromB64url(payload)));
    return s.username === env.ADMIN_USERNAME && s.expires > Date.now();
  } catch {
    return false;
  }
}

export async function safeEqual(a, b) {
  const [x, y] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(String(a))),
    crypto.subtle.digest("SHA-256", enc.encode(String(b)))
  ]);
  const xa = new Uint8Array(x), ya = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < xa.length; i++) diff |= xa[i] ^ ya[i];
  return diff === 0;
}

export const unauthorized = () =>
  Response.json({ error: "অনুমতি নেই। আবার Admin Login করুন।" }, { status: 401 });