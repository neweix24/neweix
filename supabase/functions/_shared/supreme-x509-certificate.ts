/**
 * Bounded structural X.509 reader for the Deno attestation feasibility work.
 * It extracts signed bytes and fields only: no trust/path validation or authorization.
 */
export type X509Extension = { oid: string; critical: boolean; value: Uint8Array };
export type ParsedX509Certificate = {
  rawCertificate: Uint8Array;
  tbsCertificate: Uint8Array;
  serialNumber: Uint8Array;
  signatureAlgorithmOid: string;
  signatureAlgorithmParameters: Uint8Array | null;
  issuer: Uint8Array;
  validity: Uint8Array;
  subject: Uint8Array;
  subjectPublicKeyInfo: Uint8Array;
  subjectPublicKeyAlgorithmOid: string;
  subjectPublicKeyParameters: Uint8Array | null;
  subjectPublicKey: Uint8Array;
  signature: Uint8Array;
  extensions: X509Extension[];
};
type Tlv = { tag: number; start: number; contentStart: number; end: number };
const MAX_CERTIFICATE_BYTES = 64 * 1024;
const MAX_TLVS = 4096;
const MAX_DEPTH = 20;

function readTlv(data: Uint8Array, start: number, boundary: number): Tlv {
  if (start >= boundary) throw new TypeError("Truncated X.509 DER tag.");
  const tag = data[start];
  if ((tag & 0x1f) === 0x1f) throw new TypeError("High-tag-number form is not accepted in X.509 envelope.");
  let offset = start + 1;
  if (offset >= boundary) throw new TypeError("Truncated X.509 DER length.");
  const first = data[offset++];
  let length: number;
  if (first < 0x80) length = first;
  else {
    const count = first & 0x7f;
    if (count === 0 || count > 4 || offset + count > boundary) throw new TypeError("Invalid X.509 DER length.");
    if (data[offset] === 0) throw new TypeError("Non-canonical X.509 DER length.");
    length = 0;
    for (let i = 0; i < count; i++) length = length * 256 + data[offset++];
    if (length < 0x80) throw new TypeError("Non-canonical X.509 DER length.");
  }
  const end = offset + length;
  if (!Number.isSafeInteger(end) || end > boundary) throw new TypeError("X.509 DER value exceeds boundary.");
  return { tag, start, contentStart: offset, end };
}
function children(data: Uint8Array, parent: Tlv, budget: { count: number }, depth = 1): Tlv[] {
  if (depth > MAX_DEPTH) throw new RangeError("X.509 DER nesting limit exceeded.");
  const result: Tlv[] = [];
  let offset = parent.contentStart;
  while (offset < parent.end) {
    if (++budget.count > MAX_TLVS) throw new RangeError("X.509 DER element limit exceeded.");
    const child = readTlv(data, offset, parent.end);
    result.push(child);
    if (child.end <= offset) throw new TypeError("X.509 DER parser made no progress.");
    offset = child.end;
  }
  if (offset !== parent.end) throw new TypeError("Malformed X.509 DER constructed value.");
  return result;
}
function oidToString(data: Uint8Array, tlv: Tlv): string {
  if (tlv.tag !== 0x06 || tlv.contentStart === tlv.end) throw new TypeError("Expected X.509 OBJECT IDENTIFIER.");
  const values: bigint[] = [];
  let value = 0n, active = false;
  for (let i = tlv.contentStart; i < tlv.end; i++) {
    const byte = data[i];
    if (!active && byte === 0x80) throw new TypeError("Non-canonical X.509 OID component.");
    value = (value << 7n) | BigInt(byte & 0x7f);
    active = true;
    if ((byte & 0x80) === 0) { values.push(value); value = 0n; active = false; }
  }
  if (active || values.length === 0) throw new TypeError("Truncated X.509 OBJECT IDENTIFIER.");
  const first = values.shift()!;
  const firstArc = first < 40n ? 0n : first < 80n ? 1n : 2n;
  return [firstArc, first - firstArc * 40n, ...values].map(String).join(".");
}
function raw(data: Uint8Array, tlv: Tlv): Uint8Array { return data.slice(tlv.start, tlv.end); }
function parseExtensions(data: Uint8Array, explicit: Tlv, budget: { count: number }): X509Extension[] {
  if (explicit.tag !== 0xa3) throw new TypeError("Invalid X.509 extensions wrapper.");
  const wrapper = children(data, explicit, budget, 2);
  if (wrapper.length !== 1 || wrapper[0].tag !== 0x30) throw new TypeError("Invalid X.509 Extensions sequence.");
  const result: X509Extension[] = [];
  for (const ext of children(data, wrapper[0], budget, 3)) {
    if (ext.tag !== 0x30) throw new TypeError("Invalid X.509 Extension entry.");
    const fields = children(data, ext, budget, 4);
    if (fields.length !== 2 && fields.length !== 3) throw new TypeError("Invalid X.509 Extension field count.");
    const oid = oidToString(data, fields[0]);
    let index = 1, critical = false;
    if (fields[index].tag === 0x01) {
      const bool = data.slice(fields[index].contentStart, fields[index].end);
      if (bool.length !== 1 || (bool[0] !== 0 && bool[0] !== 0xff)) throw new TypeError("Invalid X.509 Extension critical BOOLEAN.");
      critical = bool[0] === 0xff; index++;
    }
    if (index !== fields.length - 1 || fields[index].tag !== 0x04) throw new TypeError("Invalid X.509 Extension OCTET STRING.");
    result.push({ oid, critical, value: data.slice(fields[index].contentStart, fields[index].end) });
  }
  return result;
}

/** Parse one DER-encoded X.509 certificate without making a trust decision. */
export function parseX509Certificate(input: Uint8Array): ParsedX509Certificate {
  if (input.length < 128 || input.length > MAX_CERTIFICATE_BYTES) throw new RangeError("X.509 certificate size is outside accepted bounds.");
  const root = readTlv(input, 0, input.length);
  if (root.tag !== 0x30 || root.end !== input.length) throw new TypeError("X.509 Certificate must be one DER SEQUENCE.");
  const budget = { count: 1 };
  const fields = children(input, root, budget);
  if (fields.length !== 3) throw new TypeError("X.509 Certificate must have three fields.");
  const [tbs, outerAlgorithm, signatureValue] = fields;
  if (tbs.tag !== 0x30 || outerAlgorithm.tag !== 0x30 || signatureValue.tag !== 0x03) throw new TypeError("Malformed X.509 Certificate envelope.");
  const outerAlgFields = children(input, outerAlgorithm, budget);
  if (outerAlgFields.length < 1 || outerAlgFields.length > 2) throw new TypeError("Invalid X.509 signature AlgorithmIdentifier.");
  const signatureAlgorithmOid = oidToString(input, outerAlgFields[0]);
  const signatureAlgorithmParameters = outerAlgFields.length === 2 ? raw(input, outerAlgFields[1]) : null;
  const tbsFields = children(input, tbs, budget);
  let index = tbsFields[0]?.tag === 0xa0 ? 1 : 0;
  if (tbsFields.length < index + 6) throw new TypeError("X.509 TBSCertificate is incomplete.");
  const serial = tbsFields[index++], innerAlgorithm = tbsFields[index++], issuer = tbsFields[index++], validity = tbsFields[index++], subject = tbsFields[index++], spki = tbsFields[index++];
  if (serial.tag !== 0x02 || innerAlgorithm.tag !== 0x30 || issuer.tag !== 0x30 || validity.tag !== 0x30 || subject.tag !== 0x30 || spki.tag !== 0x30) {
    throw new TypeError("X.509 TBSCertificate contains invalid mandatory fields.");
  }
  const innerAlgFields = children(input, innerAlgorithm, budget);
  if (innerAlgFields.length < 1 || innerAlgFields.length > 2 || oidToString(input, innerAlgFields[0]) !== signatureAlgorithmOid) {
    throw new TypeError("X.509 inner and outer signature algorithms do not match.");
  }
  const innerParameters = innerAlgFields.length === 2 ? raw(input, innerAlgFields[1]) : null;
  if (
    (signatureAlgorithmParameters === null) !== (innerParameters === null) ||
    (signatureAlgorithmParameters !== null && innerParameters !== null &&
      (signatureAlgorithmParameters.length !== innerParameters.length ||
        signatureAlgorithmParameters.some((byte, offset) => byte !== innerParameters[offset])))
  ) {
    throw new TypeError("X.509 inner and outer signature algorithm parameters do not match.");
  }
  const spkiFields = children(input, spki, budget);
  if (spkiFields.length !== 2 || spkiFields[0].tag !== 0x30 || spkiFields[1].tag !== 0x03) {
    throw new TypeError("Malformed X.509 SubjectPublicKeyInfo.");
  }
  const spkiAlgorithmFields = children(input, spkiFields[0], budget);
  if (spkiAlgorithmFields.length < 1) throw new TypeError("Missing X.509 public-key algorithm OID.");
  const subjectPublicKeyAlgorithmOid = oidToString(input, spkiAlgorithmFields[0]);
  const subjectPublicKeyParameters = spkiAlgorithmFields.length > 1 ? raw(input, spkiAlgorithmFields[1]) : null;
  const publicKeyBits = input.slice(spkiFields[1].contentStart, spkiFields[1].end);
  if (publicKeyBits.length < 2 || publicKeyBits[0] !== 0) {
    throw new TypeError("X.509 SubjectPublicKeyInfo BIT STRING has invalid unused-bit count.");
  }
  const extField = tbsFields.slice(index).find((field) => field.tag === 0xa3);
  const signature = input.slice(signatureValue.contentStart, signatureValue.end);
  if (signature.length < 2 || signature[0] !== 0) throw new TypeError("X.509 signature BIT STRING has invalid unused-bit count.");
  return {
    rawCertificate: input.slice(),
    tbsCertificate: raw(input, tbs), serialNumber: input.slice(serial.contentStart, serial.end),
    signatureAlgorithmOid, signatureAlgorithmParameters, issuer: raw(input, issuer), validity: raw(input, validity),
    subject: raw(input, subject), subjectPublicKeyInfo: raw(input, spki),
    subjectPublicKeyAlgorithmOid, subjectPublicKeyParameters, subjectPublicKey: publicKeyBits.slice(1),
    signature: signature.slice(1),
    extensions: extField ? parseExtensions(input, extField, budget) : [],
  };
}
