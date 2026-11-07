// Validate the complete UTC calendar domain reported by the R2 event-trend RPC.
// Never accept "N sorted dates" as proof that those dates belong to the requested
// interval. The RPC's generated_at, first_day_utc, and last_day_utc must agree.
const UTC_DAY_MS = 86_400_000;
const ISO_UTC_DAY = /^\d{4}-\d{2}-\d{2}$/;
const ISO_TIMESTAMP_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function utcDayStart(value: unknown): number | null {
  if (typeof value !== "string" || !ISO_UTC_DAY.test(value)) return null;
  const timestamp = Date.parse(value + "T00:00:00.000Z");
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp).toISOString().slice(0, 10) === value ? timestamp : null;
}

export function validBehaviorUtcDayGrid(
  dates: unknown,
  first: unknown,
  last: unknown,
  generatedAt: unknown,
  expectedDays: 7 | 14 | 30,
): boolean {
  if (![7, 14, 30].includes(expectedDays) || !Array.isArray(dates)
    || dates.length !== expectedDays) return false;

  const start = utcDayStart(first);
  const end = utcDayStart(last);
  if (start === null || end === null || end - start !== (expectedDays - 1) * UTC_DAY_MS) {
    return false;
  }

  if (typeof generatedAt !== "string" || !ISO_TIMESTAMP_WITH_ZONE.test(generatedAt)) return false;
  const generatedMs = Date.parse(generatedAt);
  if (!Number.isFinite(generatedMs) || new Date(generatedMs).toISOString().slice(0, 10) !== last) {
    return false;
  }

  return dates.every((date, index) =>
    utcDayStart(date) === start + index * UTC_DAY_MS
  );
}
