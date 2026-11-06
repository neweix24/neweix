/**
 * Bounded parser for Android Remote Key Provisioning information extension CBOR.
 *
 * The pinned Android verifier's ProvisioningInfoMap schema requires only CBOR
 * map key 1 (certificatesIssued). Unknown future fields are ignored within
 * strict parser budgets. This parser does not validate certificates or authorize
 * a device and must only run after trusted chain validation.
 */
export const ANDROID_PROVISIONING_INFO_OID = "1.3.6.1.4.1.11129.2.1.30";

export type AndroidProvisioningInfo = { certificatesIssued: number };

type Head = { major: number; value: bigint; next: number };
const MAX_INPUT_BYTES = 4096;
const MAX_NODES = 128;
const MAX_DEPTH = 8;
const MAX_MAP_ENTRIES = 32;
const INT_MAX = 2147483647n;

function readHead(data: Uint8Array, offset: number): Head {
  if (offset >= data.length) throw new TypeError("Truncated CBOR item.");
  const initial = data[offset++];
  const major = initial >> 5;
  const additional = initial & 31;
  if (additional === 31) throw new TypeError("Indefinite-length CBOR is not accepted.");
  if (additional < 24) return { major, value: BigInt(additional), next: offset };
  const widths: Record<number, number> = { 24: 1, 25: 2, 26: 4, 27: 8 };
  const width = widths[additional];
  if (!width || offset + width > data.length) throw new TypeError("Invalid or truncated CBOR item.");
  let value = 0n;
  for (let i = 0; i < width; i++) value = (value << 8n) | BigInt(data[offset++]);
  if (major !== 7) {
    const minimum = width === 1 ? 24n : width === 2 ? 256n : width === 4 ? 65536n : 4294967296n;
    if (value < minimum) throw new TypeError("Non-canonical CBOR integer or length.");
  }
  return { major, value, next: offset };
}

function boundedNumber(value: bigint, label: string, maximum: number): number {
  if (value < 0n || value > BigInt(maximum)) throw new RangeError(`${label} exceeds parser limits.`);
  return Number(value);
}

function readBytes(data: Uint8Array, head: Head, label: string): number {
  const length = boundedNumber(head.value, label, MAX_INPUT_BYTES);
  const end = head.next + length;
  if (end > data.length) throw new TypeError(`Truncated CBOR ${label}.`);
  return end;
}

function failTruncated(): never {
  throw new TypeError("Truncated CBOR simple or floating-point value.");
}

function skipItem(data: Uint8Array, offset: number, depth: number, budget: { nodes: number }): number {
  if (depth > MAX_DEPTH) throw new RangeError("CBOR nesting depth exceeded.");
  if (++budget.nodes > MAX_NODES) throw new RangeError("CBOR node limit exceeded.");
  const head = readHead(data, offset);
  if (head.major === 0 || head.major === 1) return head.next;
  if (head.major === 2 || head.major === 3) return readBytes(data, head, "string");
  if (head.major === 4) {
    const count = boundedNumber(head.value, "CBOR array length", MAX_NODES);
    let next = head.next;
    for (let i = 0; i < count; i++) next = skipItem(data, next, depth + 1, budget);
    return next;
  }
  if (head.major === 5) {
    const count = boundedNumber(head.value, "CBOR map length", MAX_MAP_ENTRIES);
    let next = head.next;
    for (let i = 0; i < count * 2; i++) next = skipItem(data, next, depth + 1, budget);
    return next;
  }
  if (head.major === 6) return skipItem(data, head.next, depth + 1, budget);
  if (head.major === 7) {
    const additional = data[offset] & 31;
    if (additional === 24) return head.next;
    if (additional === 25) return offset + 3 <= data.length ? offset + 3 : failTruncated();
    if (additional === 26) return offset + 5 <= data.length ? offset + 5 : failTruncated();
    if (additional === 27) return offset + 9 <= data.length ? offset + 9 : failTruncated();
    if (additional <= 23) return head.next;
  }
  throw new TypeError("Unsupported CBOR item.");
}

export function parseAndroidProvisioningInfo(input: Uint8Array): AndroidProvisioningInfo {
  if (input.length === 0 || input.length > MAX_INPUT_BYTES) {
    throw new RangeError("Android provisioning-info CBOR size is invalid.");
  }
  const budget = { nodes: 1 };
  const root = readHead(input, 0);
  if (root.major !== 5) throw new TypeError("Provisioning info must be a CBOR map.");
  const count = boundedNumber(root.value, "provisioning-info map length", MAX_MAP_ENTRIES);
  const seen = new Set<bigint>();
  let certificatesIssued: number | undefined;
  let offset = root.next;

  for (let i = 0; i < count; i++) {
    if (++budget.nodes > MAX_NODES) throw new RangeError("CBOR node limit exceeded.");
    const key = readHead(input, offset);
    if (key.major !== 0) throw new TypeError("Provisioning-info map keys must be unsigned integers.");
    if (seen.has(key.value)) throw new TypeError("Duplicate provisioning-info map key.");
    seen.add(key.value);
    offset = key.next;

    if (key.value === 1n) {
      if (++budget.nodes > MAX_NODES) throw new RangeError("CBOR node limit exceeded.");
      const value = readHead(input, offset);
      if (value.major !== 0 && value.major !== 1) {
        throw new TypeError("certificates-issued must be a CBOR integer.");
      }
      const signedValue = value.major === 0 ? value.value : -1n - value.value;
      // Match the upstream verifier: negative values clamp to 0 and overflow clamps to Int.MAX_VALUE.
      certificatesIssued = signedValue < 0n ? 0 : signedValue > INT_MAX ? 2147483647 : Number(signedValue);
      offset = value.next;
    } else {
      offset = skipItem(input, offset, 1, budget);
    }
  }

  if (offset !== input.length) throw new TypeError("Trailing bytes after provisioning-info CBOR map.");
  if (certificatesIssued === undefined) {
    throw new TypeError("Provisioning info is missing certificates-issued (CBOR key 1).");
  }
  return { certificatesIssued };
}
