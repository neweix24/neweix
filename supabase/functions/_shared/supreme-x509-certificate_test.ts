import { assertEquals, assertThrows } from "jsr:@std/assert@1.0.14";
import { parseX509Certificate } from "./supreme-x509-certificate.ts";

type OracleExtension = { oid: string; critical: boolean; value: string };
type OracleCertificate = {
  tbs: string; serial: string; signatureAlgorithmOid: string; issuer: string;
  subject: string; spki: string; signature: string; extensions: OracleExtension[];
};
type OracleFixture = { source: string; certificates: OracleCertificate[] };

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}
function toBase64(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary);
}
function unsignedInteger(value: Uint8Array): Uint8Array {
  let offset = 0;
  while (offset < value.length - 1 && value[offset] === 0) offset++;
  return value.slice(offset);
}

Deno.test("X.509 parser rejects undersized and malformed data", () => {
  assertThrows(() => parseX509Certificate(new Uint8Array([0x30, 0x00])), RangeError);
  assertThrows(() => parseX509Certificate(new Uint8Array(128).fill(0)), TypeError);
});

const fixtureIndex = Deno.env.get("SUPREME_ATTESTATION_CERTIFICATE_FIXTURE_INDEX");
Deno.test({
  name: "X.509 parser reads real Google Android certificate-chain fixtures",
  ignore: !fixtureIndex,
  fn: async () => {
    const fixtures = JSON.parse(await Deno.readTextFile(fixtureIndex!)) as Array<{ source: string; certificatesBase64: string[] }>;
    if (fixtures.length === 0) throw new Error("No full X.509 certificate fixtures were extracted.");
    let count = 0;
    for (const fixture of fixtures) {
      if (fixture.certificatesBase64.length < 2) throw new Error(`${fixture.source}: incomplete certificate chain.`);
      for (let index = 0; index < fixture.certificatesBase64.length; index++) {
        const cert = parseX509Certificate(fromBase64(fixture.certificatesBase64[index]));
        if (!cert.serialNumber.length || cert.subjectPublicKeyInfo.length < 16 || cert.subjectPublicKey.length < 16) {
          throw new Error(`${fixture.source}: missing serial or SPKI.`);
        }
        const attestation = cert.extensions.filter((ext) => ext.oid === "1.3.6.1.4.1.11129.2.1.17");
        if (index === 0 && attestation.length !== 1) throw new Error(`${fixture.source}: leaf must contain exactly one attestation extension.`);
        if (index > 0 && attestation.length !== 0) throw new Error(`${fixture.source}: non-leaf has an attestation extension.`);
        count++;
      }
    }
    if (count < fixtures.length * 2) throw new Error("Unexpectedly small certificate fixture corpus.");
    console.log(`Parsed ${count} real X.509 certificates across ${fixtures.length} Android chains.`);
  },
});

const oracleIndex = Deno.env.get("SUPREME_X509_ORACLE_INDEX");
Deno.test({
  name: "Deno X.509 fields and extensions match independent Java 21 CertificateFactory output",
  ignore: !oracleIndex,
  fn: async () => {
    const fixtures = JSON.parse(await Deno.readTextFile(oracleIndex!)) as OracleFixture[];
    if (fixtures.length === 0) throw new Error("JDK X.509 oracle index is empty.");
    let compared = 0;
    for (const fixture of fixtures) {
      for (let index = 0; index < fixture.certificates.length; index++) {
        const oracle = fixture.certificates[index];
        const encoded = fromBase64(oracle.tbs);
        const parsedFixture = await Deno.readTextFile(oracleIndex!);
        void parsedFixture;
        // The original DER certificate is supplied by the companion fixture index.
        const certificateFixtures = JSON.parse(await Deno.readTextFile(fixtureIndex!)) as Array<{source:string;certificatesBase64:string[]}>;
        const sourceFixture = certificateFixtures.find((entry) => entry.source === fixture.source);
        if (!sourceFixture || !sourceFixture.certificatesBase64[index]) throw new Error(`${fixture.source}: missing matching PEM certificate.`);
        const parsed = parseX509Certificate(fromBase64(sourceFixture.certificatesBase64[index]));
        assertEquals(toBase64(parsed.tbsCertificate), oracle.tbs, `${fixture.source} cert ${index}: TBSCertificate`);
        assertEquals(toBase64(unsignedInteger(parsed.serialNumber)), oracle.serial, `${fixture.source} cert ${index}: serial`);
        assertEquals(parsed.signatureAlgorithmOid, oracle.signatureAlgorithmOid, `${fixture.source} cert ${index}: signature algorithm`);
        assertEquals(toBase64(parsed.issuer), oracle.issuer, `${fixture.source} cert ${index}: issuer`);
        assertEquals(toBase64(parsed.subject), oracle.subject, `${fixture.source} cert ${index}: subject`);
        assertEquals(toBase64(parsed.subjectPublicKeyInfo), oracle.spki, `${fixture.source} cert ${index}: SPKI`);
        assertEquals(toBase64(parsed.signature), oracle.signature, `${fixture.source} cert ${index}: signature`);
        const actualExtensions = parsed.extensions.map((extension) => ({
          oid: extension.oid, critical: extension.critical, value: toBase64(extension.value),
        })).sort((a, b) => a.oid.localeCompare(b.oid));
        const expectedExtensions = oracle.extensions.map((extension) => extension)
          .sort((a, b) => a.oid.localeCompare(b.oid));
        assertEquals(actualExtensions, expectedExtensions, `${fixture.source} cert ${index}: extensions`);
        compared++;
      }
    }
    if (compared < 2) throw new Error("Too few certificates were differentially compared.");
    console.log(`Java 21 X.509 differential oracle matched ${compared} real certificates across ${fixtures.length} chains.`);
  },
});
