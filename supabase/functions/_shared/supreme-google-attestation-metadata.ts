const GOOGLE_ROOTS_URL = "https://android.googleapis.com/attestation/root";
const GOOGLE_STATUS_URL = "https://android.googleapis.com/attestation/status";
const MAX_ROOTS_RESPONSE_BYTES = 256 * 1024;
const MAX_STATUS_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_ROOT_CERTIFICATES = 16;
const MAX_STATUS_ENTRIES = 100_000;
const MAX_CACHE_AGE_SECONDS = 24 * 60 * 60;

export type GoogleAttestationRoots = {
  certificatesPem: string[];
  maxAgeSeconds: number;
};

export type GoogleAttestationStatus = {
  entries: Map<string, { status: "REVOKED" | "SUSPENDED"; reason?: string; expires?: string }>;
  maxAgeSeconds: number;
};

function parseJsonObject(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be a JSON object.`);
  }
  return value as Record<string, unknown>;
}

function parseCacheAge(headers: Headers): number {
  const cacheControl = headers.get("cache-control") ?? "";
  const match = cacheControl.match(/(?:^|,)\s*max-age=(\d+)(?:\s*(?:,|$))/iu);
  if (!match) throw new Error("Google attestation metadata has no valid max-age.");
  const seconds = Number(match[1]);
  if (!Number.isSafeInteger(seconds) || seconds <= 0) {
    throw new Error("Google attestation metadata max-age is invalid.");
  }
  return Math.min(seconds, MAX_CACHE_AGE_SECONDS);
}

function decodeBase64(value: string): Uint8Array {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value)) {
    throw new TypeError("Invalid certificate Base64.");
  }
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function parsePemCertificate(value: unknown): string {
  if (typeof value !== "string" || value.length > 16 * 1024) {
    throw new TypeError("Invalid Google attestation root certificate.");
  }
  const match = value.match(
    /^-----BEGIN CERTIFICATE-----\r?\n([A-Za-z0-9+/=\r\n]+)\r?\n-----END CERTIFICATE-----\r?\n?$/u,
  );
  if (!match) throw new TypeError("Google root is not a canonical PEM certificate.");
  const compact = match[1].replace(/[\r\n]/gu, "");
  const der = decodeBase64(compact);
  if (der.length < 128 || der.length > 12 * 1024) {
    throw new TypeError("Google root certificate DER size is invalid.");
  }
  return `-----BEGIN CERTIFICATE-----\n${compact}\n-----END CERTIFICATE-----`;
}

/** Parse Google's published JSON root set. This does not validate X.509 trust paths. */
export function parseGoogleAttestationRoots(
  value: unknown,
  headers: Headers,
): GoogleAttestationRoots {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_ROOT_CERTIFICATES) {
    throw new TypeError("Google attestation root set has an invalid size.");
  }
  const certificatesPem = value.map(parsePemCertificate);
  if (new Set(certificatesPem).size !== certificatesPem.length) {
    throw new TypeError("Google attestation root set contains duplicates.");
  }
  return { certificatesPem, maxAgeSeconds: parseCacheAge(headers) };
}

/** Parse Google's status feed. Both REVOKED and SUSPENDED serials are rejected. */
export function parseGoogleAttestationStatus(
  value: unknown,
  headers: Headers,
): GoogleAttestationStatus {
  const root = parseJsonObject(value, "Google attestation status");
  const entriesValue = parseJsonObject(root.entries, "Google attestation status entries");
  const keys = Object.keys(entriesValue);
  if (keys.length > MAX_STATUS_ENTRIES) {
    throw new TypeError("Google attestation status feed is too large.");
  }

  const entries = new Map<string, { status: "REVOKED" | "SUSPENDED"; reason?: string; expires?: string }>();
  const reasons = new Set([
    "UNSPECIFIED",
    "KEY_COMPROMISE",
    "CA_COMPROMISE",
    "SUPERSEDED",
    "SOFTWARE_FLAW",
  ]);

  for (const serial of keys) {
    if (!/^[a-f1-9][a-f0-9]*$/u.test(serial)) {
      throw new TypeError("Google status feed contains an invalid certificate serial.");
    }
    const item = parseJsonObject(entriesValue[serial], "Google attestation status entry");
    if (item.status !== "REVOKED" && item.status !== "SUSPENDED") {
      throw new TypeError("Google status feed contains an unknown certificate status.");
    }
    if (item.reason !== undefined &&
      (typeof item.reason !== "string" || !reasons.has(item.reason))) {
      throw new TypeError("Google status feed contains an unknown revocation reason.");
    }
    if (item.expires !== undefined) {
      if (typeof item.expires !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(item.expires)) {
        throw new TypeError("Google status feed contains an invalid expiry date.");
      }
      const [year, month, day] = item.expires.split("-").map(Number);
      const date = new Date(Date.UTC(year, month - 1, day));
      if (
        date.getUTCFullYear() !== year ||
        date.getUTCMonth() !== month - 1 ||
        date.getUTCDate() !== day
      ) {
        throw new TypeError("Google status feed contains an invalid expiry date.");
      }
    }
    entries.set(serial, {
      status: item.status,
      ...(typeof item.reason === "string" ? { reason: item.reason } : {}),
      ...(typeof item.expires === "string" ? { expires: item.expires } : {}),
    });
  }
  return { entries, maxAgeSeconds: parseCacheAge(headers) };
}

async function fetchJson(
  url: string,
  maxBytes: number,
  fetcher: typeof fetch,
): Promise<{ value: unknown; headers: Headers }> {
  const response = await fetcher(url, {
    method: "GET",
    headers: { accept: "application/json" },
    redirect: "error",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error("Google attestation metadata request failed.");
  const contentType = response.headers.get("content-type") ?? "";
  if (!/^application\/json(?:\s*;|$)/iu.test(contentType)) {
    throw new Error("Google attestation metadata has an unexpected content type.");
  }
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (declaredLength > maxBytes) throw new Error("Google attestation metadata is too large.");
  if (!response.body) throw new Error("Google attestation metadata response is empty.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new Error("Google attestation metadata is too large.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(totalBytes);
  let bodyOffset = 0;
  for (const chunk of chunks) {
    body.set(chunk, bodyOffset);
    bodyOffset += chunk.byteLength;
  }
  const text = new TextDecoder("utf-8", { fatal: true }).decode(body);
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("Google attestation metadata is malformed JSON.");
  }
  return { value, headers: response.headers };
}

/**
 * Fetch both live Google datasets. Any HTTP, freshness-header, size, or schema
 * failure rejects the operation; callers must fail closed. Certificate path
 * validation and serial matching are intentionally separate responsibilities.
 */
export async function fetchGoogleAttestationMetadata(
  fetcher: typeof fetch = fetch,
): Promise<{ roots: GoogleAttestationRoots; status: GoogleAttestationStatus }> {
  const [rootResponse, statusResponse] = await Promise.all([
    fetchJson(GOOGLE_ROOTS_URL, MAX_ROOTS_RESPONSE_BYTES, fetcher),
    fetchJson(GOOGLE_STATUS_URL, MAX_STATUS_RESPONSE_BYTES, fetcher),
  ]);
  return {
    roots: parseGoogleAttestationRoots(rootResponse.value, rootResponse.headers),
    status: parseGoogleAttestationStatus(statusResponse.value, statusResponse.headers),
  };
}

/** Return true for any serial Google marks REVOKED or SUSPENDED. */
export function isGoogleAttestationSerialBlocked(
  serialHex: string,
  status: GoogleAttestationStatus,
): boolean {
  if (!/^[0-9a-f]+$/iu.test(serialHex)) {
    throw new TypeError("Invalid X.509 certificate serial.");
  }
  const normalized = serialHex.toLowerCase().replace(/^0+(?=.)/u, "");
  if (normalized === "0") throw new TypeError("Invalid zero certificate serial.");
  return status.entries.has(normalized);
}
