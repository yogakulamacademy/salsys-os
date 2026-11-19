// Course Management housekeeping: a batch that has started (running) or ended
// is closed automatically, so it is never offered again. Pure helpers.

/** Today's date (YYYY-MM-DD) in a time zone; falls back to India. */
export function todayIn(timeZone: string | null | undefined, now: Date): string {
  let zone = timeZone || "Asia/Kolkata";
  try { new Intl.DateTimeFormat("en-CA", { timeZone: zone }); } catch { zone = "Asia/Kolkata"; }
  return new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** A batch is closed from its start date onwards (running or finished), in its own time zone. */
export function batchHasStarted(batch: { start_date: string | null; timezone?: string | null }, now: Date): boolean {
  if (!batch.start_date || !/^\d{4}-\d{2}-\d{2}$/.test(batch.start_date)) return false;
  return batch.start_date <= todayIn(batch.timezone, now);
}
