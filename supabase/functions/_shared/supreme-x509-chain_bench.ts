import { parseX509Certificate } from "./supreme-x509-certificate.ts";
import { validateX509CertificatePath } from "./supreme-x509-chain.ts";
import type { GoogleAttestationStatus } from "./supreme-google-attestation-metadata.ts";

type CertificateFixture = { source: string; certificatesBase64: string[] };

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}
function fromPem(value: string): Uint8Array {
  const match = value.match(/^-----BEGIN CERTIFICATE-----\\s*([A-Za-z0-9+/=\\r\\n]+)\\s*-----END CERTIFICATE-----$/u);
  if (!match) throw new TypeError("Invalid fixture root PEM.");
  return fromBase64(match[1].replace(/\\s/gu, ""));
}

const fixtureIndex = Deno.env.get("SUPREME_ATTESTATION_CERTIFICATE_FIXTURE_INDEX");
const rootsPath = Deno.env.get("SUPREME_GOOGLE_ROOTS_FIXTURE_PATH");
const fixtures = fixtureIndex
  ? JSON.parse(await Deno.readTextFile(fixtureIndex)) as CertificateFixture[]
  : [];
const rootsPem = rootsPath ? JSON.parse(await Deno.readTextFile(rootsPath)) as string[] : [];
const fixture = fixtures.find((item) => item.source.endsWith("blueline/sdk28/TEE_EC_NONE.pem"));
const chain = fixture?.certificatesBase64.map((value) => parseX509Certificate(fromBase64(value))) ?? [];
const roots = rootsPem.map((pem) => parseX509Certificate(fromPem(pem)));

function freshStatus(now: number): GoogleAttestationStatus {
  return {
    entries: new Map(),
    fetchedAtMs: now - 1000,
    expiresAtMs: now + 3_599_000,
    maxAgeSeconds: 3600,
  };
}

Deno.bench({
  name: "Supreme Deno X.509 path validation (real Google TEE fixture)",
  ignore: !fixture || chain.length < 3 || roots.length === 0,
  fn: async () => {
    const now = Date.now();
    await validateX509CertificatePath(chain, roots, freshStatus(now), now);
  },
});
