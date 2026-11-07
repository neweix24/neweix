import { parseX509Certificate } from "./supreme-x509-certificate.ts";
import { validateX509CertificatePath } from "./supreme-x509-chain.ts";
import {
  parseGoogleAttestationRoots,
  parseGoogleAttestationStatus,
  type GoogleAttestationStatus,
} from "./supreme-google-attestation-metadata.ts";

type CertificateFixture = { source: string; certificatesBase64: string[] };

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

const now = Date.now();
const cacheHeaders = new Headers({
  "cache-control": "public, max-age=3600",
});
const fixtureIndex = Deno.env.get("SUPREME_ATTESTATION_CERTIFICATE_FIXTURE_INDEX");
const rootsPath = Deno.env.get("SUPREME_GOOGLE_ROOTS_FIXTURE_PATH");
if (!fixtureIndex || !rootsPath) {
  throw new Error("Runtime benchmark requires pinned certificate and Google root fixtures.");
}

const fixtures = JSON.parse(await Deno.readTextFile(fixtureIndex)) as CertificateFixture[];
const fixture = fixtures.find((item) =>
  item.source.endsWith("blueline/sdk28/TEE_EC_NONE.pem")
);
if (!fixture || fixture.certificatesBase64.length < 3) {
  throw new Error("Pinned real Google TEE certificate-chain fixture is missing.");
}

const chain = fixture.certificatesBase64.map((value) =>
  parseX509Certificate(fromBase64(value))
);
const rootPem = JSON.parse(await Deno.readTextFile(rootsPath)) as string[];
const roots = parseGoogleAttestationRoots(rootPem, cacheHeaders, now);
const parsedRoots = roots.certificatesPem.map((pem) => {
  const match = pem.match(
    /^-----BEGIN CERTIFICATE-----\\n([A-Za-z0-9+/=\\n]+)\\n-----END CERTIFICATE-----$/u,
  );
  if (!match) throw new TypeError("Malformed pinned Google root fixture.");
  const compact = match[1].replaceAll("\\n", "");
  return parseX509Certificate(fromBase64(compact));
});

// Stay below the documented 2 MiB response cap while exercising tens of
// thousands of status entries. Keys are unique, canonical, and non-zero.
const statusFixture: Record<string, { status: "REVOKED" }> = {};
for (let index = 0; index < 55_000; index++) {
  statusFixture[`a${index.toString(16)}`] = { status: "REVOKED" };
}
const statusJson = JSON.stringify({ entries: statusFixture });
if (new TextEncoder().encode(statusJson).byteLength > 2 * 1024 * 1024) {
  throw new Error("Synthetic status fixture unexpectedly exceeds the production response bound.");
}
const statusHeaders = new Headers({
  "cache-control": "public, max-age=3600",
});
const emptyStatus: GoogleAttestationStatus = {
  entries: new Map(),
  fetchedAtMs: now - 1000,
  expiresAtMs: now + 3_599_000,
  maxAgeSeconds: 3600,
};

Deno.bench({
  name: "Supreme runtime budget: JSON decode + bounded 55k-entry Google status parse",
  fn: () => {
    const decoded = JSON.parse(statusJson) as unknown;
    const status = parseGoogleAttestationStatus(decoded, statusHeaders, now);
    if (status.entries.size !== 55_000) throw new Error("Status feed parse was incomplete.");
  },
});

Deno.bench({
  name: "Supreme runtime budget: real Google TEE X.509 path validation",
  fn: async () => {
    await validateX509CertificatePath(chain, parsedRoots, emptyStatus, now);
  },
});

Deno.bench({
  name: "Supreme runtime budget: bounded status parse + real X.509 path validation",
  fn: async () => {
    const status = parseGoogleAttestationStatus(
      JSON.parse(statusJson) as unknown,
      statusHeaders,
      now,
    );
    await validateX509CertificatePath(chain, parsedRoots, status, now);
  },
});
