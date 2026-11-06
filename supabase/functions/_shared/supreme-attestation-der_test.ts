import { derIntegerToSafeNumber, parseDer } from "./supreme-attestation-der.ts";

function bytes(...values: number[]): Uint8Array {
  return new Uint8Array(values);
}

Deno.test("DER parser reads a sequence with canonical integer children", () => {
  const parsed = parseDer(bytes(0x30, 0x06, 0x02, 0x01, 0x01, 0x02, 0x01, 0x7f));
  if (parsed.tagClass !== "universal" || parsed.tagNumber !== 16 || !parsed.constructed) {
    throw new Error("Unexpected DER sequence tag.");
  }
  if (
    parsed.children.length !== 2 ||
    derIntegerToSafeNumber(parsed.children[0]) !== 1 ||
    derIntegerToSafeNumber(parsed.children[1]) !== 127
  ) {
    throw new Error("Unexpected DER sequence children.");
  }
});

Deno.test("DER parser supports high-numbered context-specific tags", () => {
  // [704] EXPLICIT NULL-shaped payload: high-tag number 704 = 0x85 0x40.
  const parsed = parseDer(bytes(0xbf, 0x85, 0x40, 0x02, 0x01, 0x01));
  if (parsed.tagClass !== "context" || parsed.tagNumber !== 704 || !parsed.constructed) {
    throw new Error("Failed to parse high-numbered context tag.");
  }
  if (derIntegerToSafeNumber(parsed.children[0]) !== 1) {
    throw new Error("Unexpected high-tag child.");
  }
});

Deno.test("DER parser rejects indefinite, non-minimal and truncated lengths", () => {
  const malformed = [
    bytes(0x30, 0x80, 0x00, 0x00),
    bytes(0x04, 0x81, 0x01, 0x00),
    bytes(0x04, 0x82, 0x00, 0x80),
    bytes(0x04, 0x02, 0x00),
  ];
  for (const input of malformed) {
    let rejected = false;
    try {
      parseDer(input);
    } catch {
      rejected = true;
    }
    if (!rejected) throw new Error("Accepted malformed DER length.");
  }
});

Deno.test("DER parser rejects malformed high tags and trailing bytes", () => {
  const malformed = [
    bytes(0x1f, 0x80, 0x1f, 0x00),
    bytes(0x1f, 0x81),
    bytes(0x02, 0x01, 0x01, 0x00),
  ];
  for (const input of malformed) {
    let rejected = false;
    try {
      parseDer(input);
    } catch {
      rejected = true;
    }
    if (!rejected) throw new Error("Accepted malformed DER tag or trailing bytes.");
  }
});

Deno.test("DER parser enforces input, depth and node limits", () => {
  const input = bytes(0x30, 0x06, 0x30, 0x04, 0x02, 0x02, 0x00, 0x01);
  const cases = [
    () => parseDer(input, { maxInputBytes: 4 }),
    () => parseDer(input, { maxDepth: 1 }),
    () => parseDer(input, { maxNodes: 2 }),
  ];
  for (const run of cases) {
    let rejected = false;
    try {
      run();
    } catch {
      rejected = true;
    }
    if (!rejected) throw new Error("DER parser ignored a configured resource limit.");
  }
});

Deno.test("DER INTEGER parser rejects negative, empty and non-canonical values", () => {
  const malformed = [
    parseDer(bytes(0x02, 0x01, 0xff)),
    parseDer(bytes(0x02, 0x00)),
    parseDer(bytes(0x02, 0x02, 0x00, 0x01)),
  ];
  for (const element of malformed) {
    let rejected = false;
    try {
      derIntegerToSafeNumber(element);
    } catch {
      rejected = true;
    }
    if (!rejected) throw new Error("Accepted malformed DER INTEGER.");
  }
});
