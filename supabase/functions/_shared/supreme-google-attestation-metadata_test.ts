import {
  isGoogleAttestationSerialBlocked,
  parseGoogleAttestationRoots,
  parseGoogleAttestationStatus,
} from "./supreme-google-attestation-metadata.ts";

const freshHeaders = new Headers({ "cache-control": "public, max-age=3600" });

// Minimal DER-shaped bytes are sufficient for parser bounds/encoding tests;
// X.509 cryptographic validation is intentionally a separate verifier stage.
const testPem = `-----BEGIN CERTIFICATE-----
${"A".repeat(172)}
-----END CERTIFICATE-----`;

Deno.test("Google root parser accepts a bounded PEM list with cache freshness", () => {
  const roots = parseGoogleAttestationRoots([testPem], freshHeaders);
  if (roots.certificatesPem.length !== 1 || roots.maxAgeSeconds !== 3600) {
    throw new Error("Unexpected parsed Google root metadata.");
  }
});

Deno.test("Google root parser rejects empty, duplicate and malformed sets", () => {
  const cases: unknown[] = [[], [testPem, testPem], ["not a certificate"], null];
  for (const value of cases) {
    let rejected = false;
    try {
      parseGoogleAttestationRoots(value, freshHeaders);
    } catch {
      rejected = true;
    }
    if (!rejected) throw new Error("Accepted malformed Google root set.");
  }
});

Deno.test("Google root parser fails closed without freshness metadata", () => {
  let rejected = false;
  try {
    parseGoogleAttestationRoots([testPem], new Headers());
  } catch {
    rejected = true;
  }
  if (!rejected) throw new Error("Accepted root metadata without max-age.");
});

Deno.test("Google status parser blocks revoked and suspended serials", () => {
  const status = parseGoogleAttestationStatus({
    entries: {
      "a123": { status: "REVOKED", reason: "KEY_COMPROMISE" },
      "b456": { status: "SUSPENDED", expires: "2027-01-01" },
    },
  }, freshHeaders);
  if (
    !isGoogleAttestationSerialBlocked("00A123", status) ||
    !isGoogleAttestationSerialBlocked("b456", status) ||
    isGoogleAttestationSerialBlocked("c789", status)
  ) {
    throw new Error("Unexpected Google attestation serial decision.");
  }
});

Deno.test("Google status parser rejects unknown status, reason and serial encodings", () => {
  const malformed = [
    { entries: { "a123": { status: "VALID" } } },
    { entries: { "a123": { status: "REVOKED", reason: "UNKNOWN" } } },
    { entries: { "00a123": { status: "REVOKED" } } },
    { entries: [] },
  ];
  for (const value of malformed) {
    let rejected = false;
    try {
      parseGoogleAttestationStatus(value, freshHeaders);
    } catch {
      rejected = true;
    }
    if (!rejected) throw new Error("Accepted malformed Google status feed.");
  }
});

Deno.test("Google status parser rejects invalid expiry dates", () => {
  let rejected = false;
  try {
    parseGoogleAttestationStatus({
      entries: { "a123": { status: "REVOKED", expires: "not-a-date" } },
    }, freshHeaders);
  } catch {
    rejected = true;
  }
  if (!rejected) throw new Error("Accepted invalid expiry date.");
});

Deno.test("Google metadata fetcher requests both official feeds and parses them", async () => {
  const requested: string[] = [];
  const fetcher: typeof fetch = async (input) => {
    const url = String(input);
    requested.push(url);
    const body = url.endsWith("/root")
      ? [testPem]
      : { entries: { "a123": { status: "REVOKED", reason: "KEY_COMPROMISE" } } };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "public, max-age=1800",
      },
    });
  };

  const metadata = await (await import("./supreme-google-attestation-metadata.ts"))
    .fetchGoogleAttestationMetadata(fetcher);

  if (
    requested.length !== 2 ||
    !requested.includes("https://android.googleapis.com/attestation/root") ||
    !requested.includes("https://android.googleapis.com/attestation/status") ||
    metadata.roots.certificatesPem.length !== 1 ||
    !metadata.status.entries.has("a123")
  ) {
    throw new Error("Google metadata fetch did not validate both official feeds.");
  }
});

Deno.test("Google metadata fetcher fails closed when either official feed is unavailable", async () => {
  const fetcher: typeof fetch = async (input) => {
    if (String(input).endsWith("/root")) {
      return new Response(JSON.stringify([testPem]), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "cache-control": "public, max-age=1800",
        },
      });
    }
    return new Response("unavailable", { status: 503 });
  };

  let rejected = false;
  try {
    const { fetchGoogleAttestationMetadata } = await import(
      "./supreme-google-attestation-metadata.ts"
    );
    await fetchGoogleAttestationMetadata(fetcher);
  } catch {
    rejected = true;
  }
  if (!rejected) throw new Error("Accepted unavailable Google revocation feed.");
});
