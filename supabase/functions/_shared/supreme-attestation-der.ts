export type DerTagClass = "universal" | "application" | "context" | "private";

export type DerElement = {
  tagClass: DerTagClass;
  tagNumber: number;
  constructed: boolean;
  value: Uint8Array;
  children: DerElement[];
};

export type DerLimits = {
  maxInputBytes: number;
  maxDepth: number;
  maxNodes: number;
};

const DEFAULT_LIMITS: DerLimits = {
  maxInputBytes: 256 * 1024,
  maxDepth: 16,
  maxNodes: 2048,
};

const TAG_CLASSES: DerTagClass[] = [
  "universal",
  "application",
  "context",
  "private",
];

/**
 * Strict, bounded DER TLV reader for later Android Key Attestation parsing.
 *
 * This is only a syntax parser. It does not validate X.509 certificates,
 * certificate paths, Android attestation policy, or trust anchors.
 */
export function parseDer(input: Uint8Array, limits: Partial<DerLimits> = {}): DerElement {
  const effective = { ...DEFAULT_LIMITS, ...limits };
  if (
    !Number.isSafeInteger(effective.maxInputBytes) || effective.maxInputBytes < 1 ||
    !Number.isSafeInteger(effective.maxDepth) || effective.maxDepth < 1 ||
    !Number.isSafeInteger(effective.maxNodes) || effective.maxNodes < 1
  ) {
    throw new RangeError("Invalid DER parser limits.");
  }
  if (input.length < 2 || input.length > effective.maxInputBytes) {
    throw new TypeError("DER input size is outside the allowed bounds.");
  }

  let nodes = 0;

  const readElement = (start: number, boundary: number, depth: number): {
    element: DerElement;
    nextOffset: number;
  } => {
    if (depth > effective.maxDepth) throw new TypeError("DER nesting depth exceeded.");
    nodes++;
    if (nodes > effective.maxNodes) throw new TypeError("DER element count exceeded.");
    if (start >= boundary) throw new TypeError("Truncated DER tag.");

    let offset = start;
    const firstTag = input[offset++];
    const tagClass = TAG_CLASSES[firstTag >>> 6];
    const constructed = (firstTag & 0x20) !== 0;
    let tagNumber = firstTag & 0x1f;

    if (tagNumber === 0x1f) {
      tagNumber = 0;
      let count = 0;
      let terminated = false;
      while (offset < boundary && count < 5) {
        const octet = input[offset++];
        if (count === 0 && (octet & 0x7f) === 0) {
          throw new TypeError("Non-canonical DER high-tag number.");
        }
        if (tagNumber > Math.floor((0x7fffffff - (octet & 0x7f)) / 128)) {
          throw new TypeError("DER tag number overflow.");
        }
        tagNumber = tagNumber * 128 + (octet & 0x7f);
        count++;
        if ((octet & 0x80) === 0) {
          terminated = true;
          break;
        }
      }
      if (!terminated || tagNumber < 31) {
        throw new TypeError("Invalid DER high-tag number.");
      }
    }

    if (offset >= boundary) throw new TypeError("Truncated DER length.");
    const firstLength = input[offset++];
    let valueLength: number;
    if (firstLength < 0x80) {
      valueLength = firstLength;
    } else {
      const lengthBytes = firstLength & 0x7f;
      if (lengthBytes === 0) throw new TypeError("Indefinite length is not valid DER.");
      if (lengthBytes > 4 || offset + lengthBytes > boundary) {
        throw new TypeError("Invalid or oversized DER length.");
      }
      if (input[offset] === 0) throw new TypeError("Non-canonical DER length.");
      valueLength = 0;
      for (let index = 0; index < lengthBytes; index++) {
        valueLength = valueLength * 256 + input[offset++];
      }
      if (valueLength < 0x80) throw new TypeError("Non-canonical DER length.");
    }

    const valueEnd = offset + valueLength;
    if (!Number.isSafeInteger(valueEnd) || valueEnd > boundary) {
      throw new TypeError("DER value extends beyond its enclosing boundary.");
    }

    const value = input.slice(offset, valueEnd);
    const children: DerElement[] = [];
    if (constructed) {
      let childOffset = offset;
      while (childOffset < valueEnd) {
        const child = readElement(childOffset, valueEnd, depth + 1);
        if (child.nextOffset <= childOffset) {
          throw new TypeError("DER parser made no forward progress.");
        }
        children.push(child.element);
        childOffset = child.nextOffset;
      }
      if (childOffset !== valueEnd) throw new TypeError("Malformed constructed DER value.");
    }

    return {
      element: { tagClass, tagNumber, constructed, value, children },
      nextOffset: valueEnd,
    };
  };

  const parsed = readElement(0, input.length, 1);
  if (parsed.nextOffset !== input.length) {
    throw new TypeError("Trailing bytes after DER value.");
  }
  return parsed.element;
}

/** Read a DER INTEGER as a non-negative safe integer with canonical encoding. */
export function derIntegerToSafeNumber(element: DerElement): number {
  if (element.tagClass !== "universal" || element.tagNumber !== 2 || element.constructed) {
    throw new TypeError("Expected a primitive DER INTEGER.");
  }
  const bytes = element.value;
  if (bytes.length === 0 || (bytes[0] & 0x80) !== 0) {
    throw new TypeError("DER INTEGER must be non-negative and non-empty.");
  }
  if (
    bytes.length > 1 &&
    bytes[0] === 0 &&
    (bytes[1] & 0x80) === 0
  ) {
    throw new TypeError("Non-canonical DER INTEGER.");
  }
  if (bytes.length > 6) throw new RangeError("DER INTEGER exceeds supported size.");
  let value = 0;
  for (const byte of bytes) value = value * 256 + byte;
  if (!Number.isSafeInteger(value)) throw new RangeError("DER INTEGER is not a safe integer.");
  return value;
}
