import { getCloudflareContext } from "@opennextjs/cloudflare";

type PathaoConfig = {
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
  baseUrl: string;
};

type PathaoToken = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
};

function getEnvValue(env: Record<string, unknown>, key: string): string {
  const value = env[key];
  return typeof value === "string" ? value.trim() : "";
}

export async function getPathaoStoreId(): Promise<number> {
  const context = await getCloudflareContext();
  const env = context.env as Record<string, unknown>;
  const raw = getEnvValue(env, "PATHAO_STORE_ID");
  const storeId = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(storeId) || storeId < 1) {
    throw new Error("PATHAO_STORE_ID must be configured as a positive integer.");
  }
  return storeId;
}

export async function getPathaoConfig(): Promise<PathaoConfig> {
  const context = await getCloudflareContext();
  const env = context.env as Record<string, unknown>;

  const clientId = getEnvValue(env, "PATHAO_CLIENT_ID");
  const clientSecret = getEnvValue(env, "PATHAO_CLIENT_SECRET");
  const username = getEnvValue(env, "PATHAO_USERNAME");
  const password = getEnvValue(env, "PATHAO_PASSWORD");
  const configuredBaseUrl = getEnvValue(env, "PATHAO_BASE_URL");

  const baseUrl = configuredBaseUrl || "https://api-hermes.pathao.com";
  const allowedHosts = new Set([
    "api-hermes.pathao.com",
    "courier-api-sandbox.pathao.com",
  ]);

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(baseUrl);
  } catch {
    throw new Error("PATHAO_BASE_URL configuration is invalid.");
  }

  if (
    parsedUrl.protocol !== "https:" ||
    !allowedHosts.has(parsedUrl.hostname) ||
    parsedUrl.pathname !== "/" ||
    parsedUrl.search ||
    parsedUrl.hash
  ) {
    throw new Error("PATHAO_BASE_URL must be an approved Pathao HTTPS API host.");
  }

  if (!clientId || !clientSecret || !username || !password) {
    throw new Error("Pathao API credentials are not configured.");
  }

  return {
    clientId,
    clientSecret,
    username,
    password,
    baseUrl: parsedUrl.origin,
  };
}

async function pathaoRequest<T>(
  config: PathaoConfig,
  path: string,
  accessToken?: string,
): Promise<T> {
  const response = await fetch(`${config.baseUrl}${path}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const record = payload && typeof payload === "object"
      ? payload as Record<string, unknown>
      : null;
    const message = typeof record?.message === "string"
      ? record.message
      : "Pathao API request failed.";
    const errorDetails = record?.errors && typeof record.errors === "object"
      ? Object.entries(record.errors as Record<string, unknown>)
          .slice(0, 4)
          .map(([field, value]) => {
            const detail = Array.isArray(value)
              ? value.filter((item) => typeof item === "string").join(", ")
              : typeof value === "string"
                ? value
                : JSON.stringify(value);
            return detail ? `${field}: ${detail.slice(0, 160)}` : "";
          })
          .filter(Boolean)
          .join("; ")
      : "";
    const requestId = [record?.request_id, record?.trace_id]
      .find((value) => typeof value === "string");
    const diagnostic = [
      message,
      errorDetails,
      typeof requestId === "string" ? `Request ID: ${requestId.slice(0, 100)}` : "",
    ].filter(Boolean).join(" | ");
    throw new Error(`Pathao API (${response.status}): ${diagnostic.slice(0, 600)}`);
  }
  return payload as T;
}

export async function getPathaoAccessToken(config: PathaoConfig): Promise<string> {
  const response = await fetch(`${config.baseUrl}/aladdin/api/v1/issue-token`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      username: config.username,
      password: config.password,
      grant_type: "password",
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });

  const payload = await response.json().catch(() => null) as
    | (PathaoToken & { message?: string })
    | null;

  if (!response.ok || !payload || typeof payload.access_token !== "string") {
    throw new Error(
      payload?.message || `Pathao authentication failed (${response.status}).`,
    );
  }

  return payload.access_token;
}

export async function getPathaoStores() {
  const config = await getPathaoConfig();
  const token = await getPathaoAccessToken(config);
  return pathaoRequest<unknown>(
    config,
    "/aladdin/api/v1/stores",
    token,
  );
}

export async function getPathaoCities() {
  const config = await getPathaoConfig();
  const token = await getPathaoAccessToken(config);
  return pathaoRequest<unknown>(
    config,
    "/aladdin/api/v1/countries/1/city-list",
    token,
  );
}

export async function testPathaoConnection() {
  const config = await getPathaoConfig();
  await getPathaoAccessToken(config);
  return {
    environment: config.baseUrl.includes("sandbox") ? "sandbox" : "production",
  };
}


export type PathaoCreateOrderInput = {
  storeId: number;
  merchantOrderId: string;
  recipientName: string;
  recipientPhone: string;
  recipientAddress: string;
  itemQuantity: number;
  itemWeightKg: number;
  amountToCollect: number;
  itemDescription?: string;
  specialInstruction?: string;
};

type PathaoCreateOrderResponse = {
  data?: {
    consignment_id?: string;
    merchant_order_id?: string;
    order_status?: string;
    delivery_fee?: number;
  };
  message?: string;
};

export async function createPathaoOrder(input: PathaoCreateOrderInput) {
  const config = await getPathaoConfig();
  const token = await getPathaoAccessToken(config);
  const response = await fetch(`${config.baseUrl}/aladdin/api/v1/orders`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      store_id: input.storeId,
      merchant_order_id: input.merchantOrderId,
      recipient_name: input.recipientName,
      recipient_phone: input.recipientPhone,
      recipient_address: input.recipientAddress,
      delivery_type: 48,
      item_type: 2,
      item_quantity: input.itemQuantity,
      item_weight: input.itemWeightKg,
      amount_to_collect: input.amountToCollect,
      ...(input.itemDescription ? { item_description: input.itemDescription.slice(0, 200) } : {}),
      ...(input.specialInstruction ? { special_instruction: input.specialInstruction.slice(0, 500) } : {}),
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });

  const payload = await response.json().catch(() => null) as PathaoCreateOrderResponse | null;
  if (!response.ok || !payload?.data?.consignment_id) {
    const message = typeof payload?.message === "string" ? payload.message : "Pathao order booking failed.";
    throw new Error(`Pathao API (${response.status}): ${message}`);
  }
  return payload.data;
}

export async function getPathaoOrderInfo(consignmentId: string) {
  if (!/^[A-Za-z0-9-]{3,80}$/.test(consignmentId)) {
    throw new Error("Pathao consignment ID is invalid.");
  }
  const config = await getPathaoConfig();
  const token = await getPathaoAccessToken(config);
  return pathaoRequest<unknown>(
    config,
    `/aladdin/api/v1/orders/${encodeURIComponent(consignmentId)}/info`,
    token,
  );
}

async function pathaoMutation<T>(
  config: PathaoConfig,
  path: string,
  accessToken: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(`${config.baseUrl}${path}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "message" in payload &&
      typeof payload.message === "string"
        ? payload.message
        : "Pathao API request failed.";
    throw new Error(`Pathao API (${response.status}): ${message}`);
  }
  return payload as T;
}

async function withPathaoToken<T>(
  operation: (config: PathaoConfig, token: string) => Promise<T>,
): Promise<T> {
  const config = await getPathaoConfig();
  const token = await getPathaoAccessToken(config);
  return operation(config, token);
}

export async function getPathaoZones(cityId: number) {
  if (!Number.isSafeInteger(cityId) || cityId < 1) throw new Error("Invalid Pathao city ID.");
  return withPathaoToken((config, token) =>
    pathaoRequest<unknown>(config, `/aladdin/api/v1/cities/${cityId}/zone-list`, token),
  );
}

export type PathaoCityZonesResult = {
  cityId: number;
  payload?: unknown;
  error?: string;
};

/**
 * Load zones for a small city batch using one merchant token. This avoids
 * re-authenticating once per district during the 64-district coverage sync.
 */
export async function getPathaoZonesForCities(cityIds: number[]): Promise<PathaoCityZonesResult[]> {
  const uniqueIds = [...new Set(cityIds)];
  if (uniqueIds.length > 16 || uniqueIds.some((id) => !Number.isSafeInteger(id) || id < 1)) {
    throw new Error("Pathao zone batch must contain at most 16 valid city IDs.");
  }
  if (uniqueIds.length === 0) return [];

  return withPathaoToken(async (config, token) => {
    const results: PathaoCityZonesResult[] = new Array(uniqueIds.length);
    let cursor = 0;
    const worker = async () => {
      while (true) {
        const index = cursor++;
        if (index >= uniqueIds.length) return;
        const cityId = uniqueIds[index];
        try {
          const payload = await pathaoRequest<unknown>(
            config,
            `/aladdin/api/v1/cities/${cityId}/zone-list`,
            token,
          );
          results[index] = { cityId, payload };
        } catch (error) {
          results[index] = {
            cityId,
            error: error instanceof Error ? error.message : "Pathao zone lookup failed.",
          };
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, uniqueIds.length) }, () => worker()));
    return results;
  });
}

export async function getPathaoAreas(zoneId: number) {
  if (!Number.isSafeInteger(zoneId) || zoneId < 1) throw new Error("Invalid Pathao zone ID.");
  return withPathaoToken((config, token) =>
    pathaoRequest<unknown>(config, `/aladdin/api/v1/zones/${zoneId}/area-list`, token),
  );
}

/**
 * Fetch the Pathao area catalog for mapped zones with one merchant token.
 * Per-zone failures are returned independently so one unavailable zone does
 * not prevent the remaining catalog from being refreshed.
 */
export type PathaoZoneAreasResult = {
  zoneId: number;
  payload?: unknown;
  error?: string;
};

export async function getPathaoAreasForZones(zoneIds: number[]): Promise<PathaoZoneAreasResult[]> {
  const uniqueIds = [...new Set(zoneIds)];
  // Keep each Worker invocation comfortably below Cloudflare's subrequest cap.
  if (uniqueIds.length > 6 || uniqueIds.some((id) => !Number.isSafeInteger(id) || id < 1)) {
    throw new Error("Pathao area sync must contain at most 6 valid zone IDs per batch.");
  }
  if (uniqueIds.length === 0) return [];

  return withPathaoToken(async (config, token) => {
    const results: PathaoZoneAreasResult[] = [];
    for (const zoneId of uniqueIds) {
      // Serialize requests to avoid triggering Pathao merchant API rate limits.
      if (results.length > 0) await new Promise((resolve) => setTimeout(resolve, 1_200));
      let lastError: unknown;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const payload = await pathaoRequest<unknown>(
            config,
            `/aladdin/api/v1/zones/${zoneId}/area-list`,
            token,
          );
          results.push({ zoneId, payload });
          lastError = undefined;
          break;
        } catch (error) {
          lastError = error;
          const message = error instanceof Error ? error.message : "";
          const isRateLimited = message.includes("Pathao API (429)");
          if (!isRateLimited || attempt === 2) break;
          await new Promise((resolve) => setTimeout(resolve, 2_000 * (attempt + 1)));
        }
      }
      if (lastError !== undefined) {
        results.push({
          zoneId,
          error: lastError instanceof Error ? lastError.message : "Pathao area lookup failed.",
        });
      }
    }
    return results;
  });
}

export type PathaoPriceInput = {
  storeId: number;
  itemType: number;
  deliveryType: number;
  itemWeightKg: number;
  recipientCity?: number;
  recipientZone?: number;
};

export async function calculatePathaoPrice(input: PathaoPriceInput) {
  if (!Number.isSafeInteger(input.storeId) || input.storeId < 1 ||
      !Number.isSafeInteger(input.itemType) || !Number.isSafeInteger(input.deliveryType) ||
      !Number.isFinite(input.itemWeightKg) || input.itemWeightKg <= 0 || input.itemWeightKg > 10) {
    throw new Error("Invalid Pathao price calculation input.");
  }
  return withPathaoToken((config, token) =>
    pathaoMutation<unknown>(config, "/aladdin/api/v1/merchant/price-plan", token, {
      store_id: input.storeId,
      item_type: input.itemType,
      delivery_type: input.deliveryType,
      item_weight: input.itemWeightKg,
      ...(input.recipientCity ? { recipient_city: input.recipientCity } : {}),
      ...(input.recipientZone ? { recipient_zone: input.recipientZone } : {}),
    }),
  );
}

export async function createPathaoBulkOrders(orders: PathaoCreateOrderInput[]) {
  if (!Array.isArray(orders) || orders.length < 1 || orders.length > 50) {
    throw new Error("Bulk booking supports between 1 and 50 orders per request.");
  }
  const payload = orders.map((input) => ({
    store_id: input.storeId,
    merchant_order_id: input.merchantOrderId,
    recipient_name: input.recipientName,
    recipient_phone: input.recipientPhone,
    recipient_address: input.recipientAddress,
    delivery_type: 48,
    item_type: 2,
    item_quantity: input.itemQuantity,
    item_weight: input.itemWeightKg,
    amount_to_collect: input.amountToCollect,
    ...(input.itemDescription ? { item_description: input.itemDescription.slice(0, 200) } : {}),
    ...(input.specialInstruction ? { special_instruction: input.specialInstruction.slice(0, 500) } : {}),
  }));
  return withPathaoToken((config, token) =>
    pathaoMutation<unknown>(config, "/aladdin/api/v1/orders/bulk", token, { orders: payload }),
  );
}

