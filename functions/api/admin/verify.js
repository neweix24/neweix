export async function onRequestGet({ request, env }) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(/(?:^|;\s*)neweix_admin=([^;]+)/);

  if (!match || !env.SESSION_SECRET) {
    return Response.json({ authenticated: false }, { status: 401 });
  }

  try {
    const token = match[1];
    const parts = token.split(".");
    if (parts.length !== 2) throw new Error("Invalid token");

    const [payload, signature] = parts;
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(env.SESSION_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const binary = atob(signature);
    const signatureBytes = Uint8Array.from(binary, c => c.charCodeAt(0));
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      signatureBytes,
      new TextEncoder().encode(payload)
    );

    if (!valid) throw new Error("Invalid signature");

    const data = JSON.parse(atob(payload));
    if (!data.username || !data.expires || Date.now() > data.expires) {
      throw new Error("Expired session");
    }

    return Response.json({ authenticated: true });
  } catch {
    return Response.json({ authenticated: false }, { status: 401 });
  }
}