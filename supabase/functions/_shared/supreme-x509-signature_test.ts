import { parseX509Certificate } from "./supreme-x509-certificate.ts";
import { verifyX509CertificateSignature } from "./supreme-x509-signature.ts";

type OracleCertificate = { signatureVerifiedByNext: boolean };
type OracleFixture = { source: string; certificates: OracleCertificate[] };
type CertificateFixture = { source: string; certificatesBase64: string[] };

function assertEquals(actual: unknown, expected: unknown, message = "Values differ."): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(message);
  }
}
function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

const fixtureIndex = Deno.env.get("SUPREME_ATTESTATION_CERTIFICATE_FIXTURE_INDEX");
const oracleIndex = Deno.env.get("SUPREME_X509_ORACLE_INDEX");

Deno.test({
  name: "Deno certificate signature checks match JDK Certificate.verify across real Android chains",
  ignore: !fixtureIndex || !oracleIndex,
  fn: async () => {
    const certFixtures = JSON.parse(await Deno.readTextFile(fixtureIndex!)) as CertificateFixture[];
    const oracleFixtures = JSON.parse(await Deno.readTextFile(oracleIndex!)) as OracleFixture[];
    const oracleBySource = new Map(oracleFixtures.map((fixture) => [fixture.source, fixture]));
    let checked = 0;
    for (const fixture of certFixtures) {
      const oracle = oracleBySource.get(fixture.source);
      if (!oracle) throw new Error(`${fixture.source}: missing JDK signature oracle.`);
      if (fixture.certificatesBase64.length !== oracle.certificates.length) {
        throw new Error(`${fixture.source}: certificate/oracle chain length mismatch.`);
      }
      const chain = fixture.certificatesBase64.map((value) => parseX509Certificate(fromBase64(value)));
      for (let index = 0; index + 1 < chain.length; index++) {
        let valid: boolean;
        try {
          valid = await verifyX509CertificateSignature(chain[index], chain[index + 1]);
        } catch (error) {
          const prefix = Array.from(chain[index].signature.slice(0, 12), (byte) => byte.toString(16).padStart(2, "0")).join("");
          throw new Error(
            `${fixture.source} cert ${index}: sigAlg=${chain[index].signatureAlgorithmOid}, issuerKeyAlg=${chain[index + 1].subjectPublicKeyAlgorithmOid}, signaturePrefix=${prefix}: ${String(error)}`,
          );
        }
        assertEquals(valid, oracle.certificates[index].signatureVerifiedByNext, `${fixture.source} cert ${index}: signature result`);
        if (!valid) throw new Error(`${fixture.source} cert ${index}: expected a valid fixture certificate signature.`);
        const changedSignature = chain[index].signature.slice();
        changedSignature[0] ^= 0x01;
        const tampered = { ...chain[index], signature: changedSignature };
        const tamperedValid = await verifyX509CertificateSignature(tampered, chain[index + 1]);
        assertEquals(tamperedValid, false, `${fixture.source} cert ${index}: tampered signature must fail`);
        checked++;
      }
    }
    if (checked === 0) throw new Error("No certificate signatures were verified.");
    console.log(`Deno WebCrypto verified ${checked} real Android certificate signatures against their next chain certificates; tampered signatures were rejected.`);
  },
});
