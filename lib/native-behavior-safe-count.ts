// Strict boundary for aggregate counts returned by the database.
// Never coerce null, booleans, missing fields, arrays, or empty strings to zero:
// unavailable evidence must not appear as a measured zero in Marketing → Behavior.
export function safeBehaviorCount(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  }
  // Retain compatibility with JSON providers that serialize bigint counts
  // as decimal strings, without accepting whitespace, signs, exponents, etc.
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value)) return null;
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) ? numeric : null;
}
