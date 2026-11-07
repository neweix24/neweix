import {
  buildSupremeProofPayload,
  decodeEcdsaDerSignature,
  decodeSupremeChallenge,
  encodeSupremeChallenge,
  verifySupremeChallengeProof,
} from "./supreme-attestation-proof.ts";

const CHALLENGE_ID = "b8f3e5b2-1b5a-4a7e-8a1a-2d0c6f4e9b11";

function toArrayBuffer(value: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
}

function derInteger(value: Uint8Array): number[] {
  let start = 0;
  while (start < value.length - 1 && value[start] === 0) start++;
  const trimmed = value.slice(start);
  const needsPadding = (trimmed[0] & 0x80) !== 0;
  const bytes = needsPadding ? [0, ...trimmed] : [...trimmed];
  return [0x02, bytes.length, ...bytes];
}

function rawEcdsaToDer(raw: Uint8Array): Uint8Array {
  const half = raw.length / 2;
  const body = [...derInteger(raw.slice(0, half)), ...derInteger(raw.slice(half))];
  return new Uint8Array([0x30, body.length, ...body]);
}

Deno.test("challenge encoding round-trips exactly 32 bytes", () => {
  const bytes = Uint8Array.from({ length: 32 }, (_, index) => index);
  const encoded = encodeSupremeChallenge(bytes);
  if (encoded.length !== 43) throw new Error("Expected 43-character base64url.");
  const decoded = decodeSupremeChallenge(encoded);
  if (decoded.some((value, index) => value !== bytes[index])) {
    throw new Error("Challenge round-trip mismatch.");
  }
});

Deno.test("challenge decoder rejects padding, wrong size and non-canonical input", () => {
  for (const value of ["", "A".repeat(44), "A".repeat(42), "A".repeat(43) + "="]) {
    let rejected = false;
    try {
      decodeSupremeChallenge(value);
    } catch {
      rejected = true;
    }
    if (!rejected) throw new Error(`Accepted invalid challenge: ${value}`);
  }
});

Deno.test("proof payload is domain-separated and byte-for-byte canonical", () => {
  const challenge = new Uint8Array(32);
  const payload = new TextDecoder().decode(
    buildSupremeProofPayload(CHALLENGE_ID, challenge),
  );
  if (
    payload !==
      "NEWEIX-SUPREME-ATTESTATION-V1\n" + CHALLENGE_ID + "\n" +
        "A".repeat(42) + "A"
  ) {
    throw new Error("Unexpected proof payload.");
  }
});

Deno.test("proof payload rejects non-v4 UUIDs and invalid challenge lengths", () => {
  const challenge = new Uint8Array(32);
  for (const id of ["not-a-uuid", "b8f3e5b2-1b5a-1a7e-8a1a-2d0c6f4e9b11"]) {
    let rejected = false;
    try {
      buildSupremeProofPayload(id, challenge);
    } catch {
      rejected = true;
    }
    if (!rejected) throw new Error(`Accepted invalid challenge ID: ${id}`);
  }
});

Deno.test("DER ECDSA signature converts to 64-byte P-1363", async () => {
  const keys = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const data = new TextEncoder().encode("der conversion test");
  const raw = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, keys.privateKey, data),
  );
  const der = rawEcdsaToDer(raw);
  const converted = decodeEcdsaDerSignature(der);
  if (converted.length !== 64 || converted.some((value, index) => value !== raw[index])) {
    throw new Error("DER to P-1363 conversion mismatch.");
  }
});

Deno.test("DER parser rejects malformed and non-canonical signatures", () => {
  const invalid = [
    new Uint8Array([]),
    new Uint8Array([0x31, 0x00]),
    new Uint8Array([0x30, 0x06, 0x02, 0x01, 0x00, 0x02, 0x01, 0x00]),
    new Uint8Array([0x30, 0x07, 0x02, 0x02, 0x00, 0x01, 0x02, 0x01, 0x01]),
  ];
  for (const der of invalid) {
    let rejected = false;
    try {
      decodeEcdsaDerSignature(der);
    } catch {
      rejected = true;
    }
    if (!rejected) throw new Error("Accepted malformed DER signature.");
  }
});

Deno.test("proof verifies only against the matching challenge and key", async () => {
  const keys = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const payload = buildSupremeProofPayload(CHALLENGE_ID, challenge);
  const raw = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, keys.privateKey, toArrayBuffer(payload)),
  );
  const der = rawEcdsaToDer(raw);
  const valid = await verifySupremeChallengeProof(
    keys.publicKey,
    CHALLENGE_ID,
    challenge,
    der,
  );
  const wrongChallenge = await verifySupremeChallengeProof(
    keys.publicKey,
    CHALLENGE_ID,
    crypto.getRandomValues(new Uint8Array(32)),
    der,
  );
  if (!valid || wrongChallenge) throw new Error("Challenge proof verification failed.");
});
