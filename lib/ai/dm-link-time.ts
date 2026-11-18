/**
 * Single timestamp parser for the offline DM-link evidence boundary.
 * PostgreSQL timestamptz supports six decimal places, while Date.parse()
 * truncates to milliseconds. Use offset-aware Unix microseconds throughout.
 * Never use browser/client timestamps as proof of a database commit.
 */
export function parseDmLinkInstant(value: unknown): bigint | null {
  if (typeof value !== 'string') return null;
  const parts = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d{1,6}))?(Z|[+-]\d\d:\d\d)$/.exec(value);
  if (!parts) return null;
  const fractional = (parts[2] ?? '').padEnd(6, '0');
  const milliseconds = Date.parse(parts[1] + '.' + fractional.slice(0, 3) + parts[3]);
  if (!Number.isFinite(milliseconds)) return null;
  // ES2017 target: use BigInt constructors, never BigInt literal syntax.
  return BigInt(milliseconds) * BigInt(1000) + BigInt(fractional.slice(3));
}
export function sameDmLinkInstant(a: unknown, b: unknown): boolean {
  const first = parseDmLinkInstant(a), second = parseDmLinkInstant(b);
  return first !== null && second !== null && first === second;
}
export function dmLinkHoursInMicroseconds(hours: number): bigint | null {
  if (!Number.isSafeInteger(hours) || hours < 0 || hours > 720) return null;
  return BigInt(hours) * BigInt(3600000000);
}
