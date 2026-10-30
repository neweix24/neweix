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
