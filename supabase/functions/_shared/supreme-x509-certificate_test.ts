import { assertEquals, assertThrows } from "jsr:@std/assert@1.0.14";
import { parseX509Certificate } from "./supreme-x509-certificate.ts";

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
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
    const signatureAlgorithms = new Map<string, number>();
    const publicKeyAlgorithms = new Map<string, number>();
    for (const fixture of fixtures) {
      if (fixture.certificatesBase64.length < 2) throw new Error(`${fixture.source}: incomplete certificate chain.`);
      for (let index = 0; index < fixture.certificatesBase64.length; index++) {
        const cert = parseX509Certificate(fromBase64(fixture.certificatesBase64[index]));
        if (!cert.serialNumber.length || cert.subjectPublicKeyInfo.length < 16 || cert.subjectPublicKey.length < 16) throw new Error(`${fixture.source}: missing serial or SPKI.`);
        signatureAlgorithms.set(cert.signatureAlgorithmOid, (signatureAlgorithms.get(cert.signatureAlgorithmOid) ?? 0) + 1);
        publicKeyAlgorithms.set(cert.subjectPublicKeyAlgorithmOid, (publicKeyAlgorithms.get(cert.subjectPublicKeyAlgorithmOid) ?? 0) + 1);
        const attestation = cert.extensions.filter((ext) => ext.oid === "1.3.6.1.4.1.11129.2.1.17");
        if (index === 0 && attestation.length !== 1) throw new Error(`${fixture.source}: leaf must contain exactly one attestation extension.`);
        if (index > 0 && attestation.length !== 0) throw new Error(`${fixture.source}: non-leaf has an attestation extension.`);
        count++;
      }
    }
    if (count < fixtures.length * 2) throw new Error("Unexpectedly small certificate fixture corpus.");
    assertEquals(count > 0, true);
    console.log(`Parsed ${count} real X.509 certificates across ${fixtures.length} Android chains.`);
    console.log(`Certificate signature OIDs: ${JSON.stringify(Object.fromEntries(signatureAlgorithms))}`);
    console.log(`Subject public-key OIDs: ${JSON.stringify(Object.fromEntries(publicKeyAlgorithms))}`);
  },
});
