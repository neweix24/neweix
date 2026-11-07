import postgres from "npm:postgres@3.4.7";

const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
const DATABASE_URL = Deno.env.get("SUPABASE_DB_URL") ?? "";
const db = DATABASE_URL ? postgres(DATABASE_URL, { max: 2, prepare: false, ssl: "require" }) : null;

type Claims = Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200, requestId: string = crypto.randomUUID()): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "private, no-store, max-age=0",
      pragma: "no-cache",
      "x-content-type-options": "nosniff",
      "x-request-id": requestId,
    },
  });
}

function decodeClaims(request: Request): Claims | null {
  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer ([A-Za-z0-9._~-]+)$/.exec(authorization);
  if (!match) return null;
  const parts = match[1].split(".");
  if (parts.length !== 3) return null;
  try {
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const decoded = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
    const value: unknown = JSON.parse(decoded);
    return value && typeof value === "object" && !Array.isArray(value) ? value as Claims : null;
  } catch {
    return null;
  }
}

function validFreshAal2(claims: Claims): boolean {
  const now = Date.now() / 1000;
  const authTime = typeof claims.auth_time === "number" ? claims.auth_time : 0;
  return claims.iss === SUPABASE_URL + "/auth/v1" &&
    claims.role === "authenticated" && claims.aud === "authenticated" &&
    claims.aal === "aal2" && authTime > 0 && now - authTime <= 300 &&
    authTime <= now + 30 && typeof claims.sub === "string" && UUID.test(claims.sub) &&
    typeof claims.session_id === "string" && UUID.test(claims.session_id);
}

function activeAppSession(claims: Claims): { sessionId: string; deviceId: string } | null {
  const value = claims.supreme_app_session;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const binding = value as Record<string, unknown>;
  if (binding.status !== "active" ||
      typeof binding.session_id !== "string" || !UUID.test(binding.session_id) ||
      typeof binding.device_id !== "string" || !UUID.test(binding.device_id)) return null;
  return { sessionId: binding.session_id, deviceId: binding.device_id };
}

async function authorize(request: Request): Promise<{ userId: string } | null> {
  const sessionApiUrl = Deno.env.get("SUPREME_SESSION_API_URL");
  if (!sessionApiUrl || !SUPABASE_URL) return null;
  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer ([A-Za-z0-9._~-]+)$/.exec(authorization);
  if (!match) return null;
  const token = match[1];
  const claims = decodeClaims(new Request(request.url, { headers: { authorization: "Bearer " + token } }));
  if (!claims || !validFreshAal2(claims)) return null;

  let response: Response;
  try {
    response = await fetch(sessionApiUrl, {
      method: "GET",
      headers: { authorization: "Bearer " + token, accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    return null;
  }
  if (!response.ok) {
    await response.body?.cancel();
    return null;
  }
  let result: Record<string, unknown>;
  try {
    const value: unknown = await response.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    result = value as Record<string, unknown>;
  } catch {
    return null;
  }
  const appSession = claims.supreme_app_session;
  if (!appSession || typeof appSession !== "object" || Array.isArray(appSession)) return null;
  const binding = appSession as Record<string, unknown>;
  const activeSession = result.session;
  if (result.authenticated !== true || result.device_session_active !== true ||
      !activeSession || typeof activeSession !== "object" || Array.isArray(activeSession)) return null;
  const active = activeSession as Record<string, unknown>;
  if (binding.status !== "active" ||
      active.session_id !== binding.session_id || active.device_id !== binding.device_id) return null;
  return { userId: claims.sub as string };
}

async function overview(requestId: string): Promise<Response> {
  if (!db) return json({ error: { code: "SERVICE_NOT_CONFIGURED", request_id: requestId } }, 503, requestId);
  const [products, orders, warehouses] = await Promise.all([
    db.unsafe(
      "select count(*)::integer as total, count(*) filter (where is_active)::integer as active, " +
      "coalesce(sum(stock), 0)::bigint as units_in_stock, " +
      "count(*) filter (where is_active and stock <= low_stock_threshold)::integer as low_stock " +
      "from public.products",
    ),
    db.unsafe(
      "select count(*)::integer as total, " +
      "count(*) filter (where status = 'pending')::integer as pending, " +
      "count(*) filter (where status = 'processing')::integer as processing, " +
      "count(*) filter (where status = 'shipped')::integer as shipped, " +
      "count(*) filter (where status = 'delivered')::integer as delivered, " +
      "count(*) filter (where payment_status = 'paid')::integer as paid, " +
      "coalesce(sum(total) filter (where payment_status = 'paid'), 0)::numeric as paid_total_bdt " +
      "from public.orders",
    ),
    db.unsafe("select count(*) filter (where is_active)::integer as active from public.warehouses"),
  ]);
  return json({
    success: true,
    service: "neweix",
    capability_scope: ["commerce.overview.read", "commerce.orders.read"],
    read_only: true,
    overview: { products: products[0], orders: orders[0], warehouses: warehouses[0] },
    request_id: requestId,
  }, 200, requestId);
}

async function recentOrders(url: URL, requestId: string): Promise<Response> {
  if (!db) return json({ error: { code: "SERVICE_NOT_CONFIGURED", request_id: requestId } }, 503, requestId);
  const rawLimit = Number(url.searchParams.get("limit") ?? "25");
  const limit = Number.isSafeInteger(rawLimit) ? Math.max(1, Math.min(50, rawLimit)) : 25;
  const status = url.searchParams.get("status");
  const allowedStatuses = new Set(["pending", "confirmed", "processing", "packed", "shipped", "delivered", "cancelled", "returned"]);
  if (status && !allowedStatuses.has(status)) {
    return json({ error: { code: "INVALID_STATUS_FILTER", request_id: requestId } }, 400, requestId);
  }
  const rows = status
    ? await db.unsafe(
        "select id::text, order_number, status, payment_status, delivery_status, total::numeric as total_bdt, created_at " +
        "from public.orders where status = $1 order by created_at desc limit $2",
        [status, limit],
      )
    : await db.unsafe(
        "select id::text, order_number, status, payment_status, delivery_status, total::numeric as total_bdt, created_at " +
        "from public.orders order by created_at desc limit $1",
        [limit],
      );
  return json({ success: true, service: "neweix", orders: rows, request_id: requestId }, 200, requestId);
}

Deno.serve(async (request: Request) => {
  const requestId = crypto.randomUUID();
  if (request.method === "OPTIONS") return json({ success: true, request_id: requestId }, 200, requestId);
  if (request.method !== "GET") return json({ error: { code: "READ_ONLY_API", request_id: requestId } }, 405, requestId);
  try {
    const actor = await authorize(request);
    if (!actor) return json({ error: { code: "SUPREME_ATTESTED_AAL2_SESSION_REQUIRED", request_id: requestId } }, 403, requestId);
    const pathname = new URL(request.url).pathname.replace(/\/+$/, "");
    if (pathname.endsWith("/health")) {
      return json({ success: true, service: "neweix", status: "available", request_id: requestId }, 200, requestId);
    }
    if (pathname.endsWith("/overview")) return await overview(requestId);
    if (pathname.endsWith("/orders")) return await recentOrders(new URL(request.url), requestId);
    return json({ error: { code: "NOT_FOUND", request_id: requestId } }, 404, requestId);
  } catch (error) {
    console.error("Supreme Neweix service API failed", { requestId, error: String(error) });
    return json({ error: { code: "INTERNAL_ERROR", request_id: requestId } }, 500, requestId);
  }
});
