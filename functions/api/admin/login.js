export async function onRequestPost({ request, env }) {
  const { username, password } = await request.json();

  if (
    username !== env.ADMIN_USERNAME ||
    password !== env.ADMIN_PASSWORD
  ) {
    return Response.json(
      { error: "ইউজারনেম বা পাসওয়ার্ড ভুল" },
      { status: 401 }
    );
  }

  const secret = env.SESSION_SECRET;
  if (!secret) {
    return Response.json(
      { error: "সার্ভার সেটআপ অসম্পূর্ণ" },
      { status: 500 }
    );
  }

  const expires = Date.now() + 8 * 60 * 60 * 1000;
  const payload = btoa(JSON.stringify({ username, expires }));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload)
  );
  const token = payload + "." + btoa(
    String.fromCharCode(...new Uint8Array(signature))
  );

  return Response.json(
    { success: true },
    {
      headers: {
        "Set-Cookie": `neweix_admin=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800`
      }
    }
  );
}