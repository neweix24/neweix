const baseUrl = (process.env.NEWEIX_SITE_URL || "https://neweix.com").replace(/\/$/, "");
const timeoutMs = 15_000;
const retries = 3;

const publicPages = [
  "/",
  "/products",
  "/cart",
  "/checkout",
  "/search",
  "/track-order",
  "/compare",
  "/auth/login",
  "/auth/customer-login",
];

const protectedPages = [
  "/admin",
  "/admin/orders",
  "/admin/integrations",
  "/supreme",
];

const protectedCustomerPages = [
  "/wishlist",
];

const protectedApis = [
  "/api/admin/products",
  "/api/admin/orders",
  "/api/admin/pathao?action=status",
  "/api/admin/bulksms",
];

const failures = [];

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request(path) {
  return fetch(new URL(path, baseUrl), {
    method: "GET",
    redirect: "manual",
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
    headers: { "User-Agent": "NEWEIX-Production-Smoke-Test/1.0" },
  });
}

async function runCheck(label, path, validate) {
  let lastError = "No response";
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const response = await request(path);
      const result = await validate(response);
      if (result.ok) {
        process.stdout.write(`PASS  ${label} — HTTP ${response.status}\n`);
        return;
      }
      lastError = result.reason || `Unexpected HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    if (attempt < retries) await pause(attempt * 1500);
  }
  failures.push({ label, path, error: lastError });
  process.stderr.write(`FAIL  ${label} — ${lastError}\n`);
}

for (const path of publicPages) {
  await runCheck(`Public page ${path}`, path, async (response) => {
    if (response.status !== 200) return { ok: false, reason: `Expected 200, received ${response.status}` };
    const body = await response.text();
    return body.length > 0
      ? { ok: true }
      : { ok: false, reason: "Page returned an empty response body" };
  });
}

await runCheck("Public product API", "/api/products", async (response) => {
  if (response.status !== 200) return { ok: false, reason: `Expected 200, received ${response.status}` };
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return { ok: false, reason: "Expected a JSON response" };
  const body = await response.json();
  return body && typeof body === "object"
    ? { ok: true }
    : { ok: false, reason: "Product API returned an invalid JSON payload" };
});

for (const path of protectedPages) {
  await runCheck(`Protected page ${path}`, path, async (response) => {
    const location = response.headers.get("location") || "";
    const redirectedToLogin = response.status >= 300 && response.status < 400 &&
      (location.includes("/auth/login") || location.includes("/auth/customer-login"));
    return redirectedToLogin
      ? { ok: true }
      : { ok: false, reason: `Expected redirect to authentication, received HTTP ${response.status} (${location || "no Location header"})` };
  });
}

for (const path of protectedCustomerPages) {
  await runCheck(`Customer-protected page ${path}`, path, async (response) => {
    const location = response.headers.get("location") || "";
    const redirectedToCustomerLogin = response.status >= 300 && response.status < 400 &&
      location.includes("/auth/customer-login");
    return redirectedToCustomerLogin
      ? { ok: true }
      : { ok: false, reason: `Expected redirect to customer login, received HTTP ${response.status} (${location || "no Location header"})` };
  });
}

for (const path of protectedApis) {
  await runCheck(`Protected API ${path}`, path, async (response) => {
    return response.status === 401 || response.status === 403
      ? { ok: true }
      : { ok: false, reason: `Expected 401/403 without a session, received HTTP ${response.status}` };
  });
}

const protectedCustomerApis = [
  "/api/eixpay/wallet",
  "/api/account/phone/status",
];

for (const path of protectedCustomerApis) {
  await runCheck(`Customer API ${path}`, path, async (response) => {
    const contentType = response.headers.get("content-type") || "";
    if (response.status !== 401) {
      return { ok: false, reason: `Expected HTTP 401 without a customer session, received ${response.status}` };
    }
    if (!contentType.includes("application/json")) {
      return { ok: false, reason: "Expected a JSON authentication error, not an HTML redirect" };
    }
    return { ok: true };
  });
}

process.stdout.write(`\nSmoke test summary: ${publicPages.length + protectedPages.length + protectedCustomerPages.length + protectedApis.length + protectedCustomerApis.length + 1 - failures.length} passed, ${failures.length} failed.\n`);
if (failures.length > 0) {
  process.stderr.write(JSON.stringify(failures, null, 2) + "\n");
  process.exitCode = 1;
}
