// Pipeline & admissions in one sentence (owner-approved mockup, 20 Nov 2026). Pure.

export type HeadlineBatch = { name: string; startDate: string | null; interested: number; ready: number };
export type HeadlinePart = { text: string; strong?: boolean };

const fmt = (n: number) => n.toLocaleString("en-IN");

/** The batch that matters most soon: starts within 30 days, most interested. */
export function focusBatch(batches: HeadlineBatch[], now = new Date()): (HeadlineBatch & { days: number }) | null {
  const soon = batches
    .map((b) => ({ ...b, days: b.startDate ? Math.ceil((Date.parse(`${b.startDate}T00:00:00Z`) - now.getTime()) / 86_400_000) : NaN }))
    .filter((b) => Number.isFinite(b.days) && b.days >= 0 && b.days <= 30 && b.interested > 0);
  soon.sort((a, b) => b.interested - a.interested || a.days - b.days);
  return soon[0] ?? null;
}

export function admissionsHeadline(input: {
  saysPaid: number | null;
  paymentPending: number;
  paymentMonthPlus: number;
  batch: (HeadlineBatch & { days: number }) | null;
}): HeadlinePart[] {
  const parts: HeadlinePart[][] = [];
  if (input.saysPaid) parts.push([{ text: `${fmt(input.saysPaid)} say they've paid`, strong: true }, { text: " but nothing is recorded" }]);
  if (input.paymentPending) {
    parts.push([
      { text: `${fmt(input.paymentPending)} are at Payment pending`, strong: true },
      ...(input.paymentMonthPlus ? [{ text: ` (${fmt(input.paymentMonthPlus)} for a month or more)` }] : []),
    ]);
  }
  if (input.batch) {
    const b = input.batch;
    const when = b.days === 0 ? "starts today" : b.days === 1 ? "starts tomorrow" : `starts in ${b.days} days`;
    parts.push([
      { text: "the " }, { text: `${b.name} batch ${when}`, strong: true },
      { text: " with " }, { text: `${fmt(b.interested)} interested${b.ready ? ` and ${fmt(b.ready)} ready to pay` : ""}`, strong: true },
    ]);
  }
  if (!parts.length) return [{ text: "Nothing urgent in admissions right now." }];
  const out: HeadlinePart[] = [];
  parts.forEach((p, i) => {
    if (i > 0) out.push({ text: i === parts.length - 1 ? " and " : ", " });
    out.push(...p);
  });
  out.push({ text: "." });
  // Capitalise the first letter.
  out[0] = { ...out[0], text: out[0].text.charAt(0).toUpperCase() + out[0].text.slice(1) };
  return out;
}
