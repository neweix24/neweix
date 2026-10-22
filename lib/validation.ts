export function normalizeBangladeshPhone(
  input: string
): string | null {
  const digits = input.replace(/[\s()-]/g, "");

  const normalized = digits.startsWith("+880")
    ? digits
    : digits.startsWith("880")
      ? `+${digits}`
      : digits.startsWith("01")
        ? `+88${digits}`
        : "";

  return /^\+8801[3-9]\d{8}$/.test(normalized)
    ? normalized
    : null;
}

export function isValidOrderNumber(value: string): boolean {
  return /^NWX-[A-Z0-9]{5,20}$/.test(
    value.trim().toUpperCase()
  );
}