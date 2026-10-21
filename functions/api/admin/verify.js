import { verifyAdmin } from "../../_lib/auth.js";

export async function onRequestGet({ request, env }) {
  const ok = await verifyAdmin(request, env);
  return Response.json({ authenticated: ok }, { status: ok ? 200 : 401 });
}