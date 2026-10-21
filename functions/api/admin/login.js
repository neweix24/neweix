import { createToken, safeEqual } from "../../_lib/auth.js";

export async function onRequestPost({ request, env }) {
  if (!env.SESSION_SECRET || !env.ADMIN_USERNAME || !env.ADMIN_PASSWORD) {
    return Response.json({ error: "সার্ভার সেটআপ অসম্পূর্ণ" }, { status: 500 });
  }

  let body;
  try { body = await request.json(); }
  catch { return Response.json({ error: "ভুল অনুরোধ" }, { status: 400 }); }

  const userOk = await safeEqual(body?.username ?? "", env.ADMIN_USERNAME);
  const passOk = await safeEqual(body?.password ?? "", env.ADMIN_PASSWORD);

  if (!(userOk && passOk)) {
    return Response.json({ error: "ইউজারনেম বা পাসওয়ার্ড ভুল" }, { status: 401 });
  }

  const token = await createToken(env, env.ADMIN_USERNAME);

  return Response.json({ success: true }, {
    headers: {
      "Set-Cookie": `neweix_admin=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800`
    }
  });
}