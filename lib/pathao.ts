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
    const message =
      payload && typeof payload === "object" && "message" in payload &&
      typeof payload.message === "string"
        ? payload.message
        : "Pathao API request failed.";
    throw new Error(`Pathao API (${response.status}): ${message}`);
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

export async function getPathaoAreas(zoneId: number) {
  if (!Number.isSafeInteger(zoneId) || zoneId < 1) throw new Error("Invalid Pathao zone ID.");
  return withPathaoToken((config, token) =>
    pathaoRequest<unknown>(config, `/aladdin/api/v1/zones/${zoneId}/area-list`, token),
  );
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

export async function cancelPathaoOrder(consignmentId: string) {
  if (!/^[A-Za-z0-9-]{3,80}$/.test(consignmentId)) {
    throw new Error("Pathao consignment ID is invalid.");
  }
  return withPathaoToken((config, token) =>
    pathaoMutation<unknown>(
      config,
      `/aladdin/api/v1/orders/${encodeURIComponent(consignmentId)}/cancel`,
      token,
    ),
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

