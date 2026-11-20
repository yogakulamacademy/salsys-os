// The Leads page in words (owner-approved Leads mockup, 20 Nov 2026). Pure.

export type StageCounts = Partial<Record<string, number>>;

export const STRIP_STAGES: { key: string; label: string }[] = [
  { key: "new", label: "New" },
  { key: "contacted", label: "Contacted" },
  { key: "engaged", label: "Engaged" },
  { key: "qualified", label: "Qualified" },
  { key: "high_intent", label: "High intent" },
  { key: "payment_pending", label: "Payment pending" },
  { key: "enrolled", label: "Enrolled" },
];

export const QUALIFIED_UP = ["qualified", "high_intent", "payment_pending", "closed_won", "enrolled"];

const n = (v: number | undefined) => v ?? 0;
export const fmt = (v: number) => v.toLocaleString("en-IN");

export type StoryPart = { text: string; strong?: boolean };

/** One or two sentences that say what matters. Parts marked strong are bold. */
export function leadsStory(input: { all: number; unassigned: number; waiting: number | null; stages: StageCounts | null }): StoryPart[] {
  const { all, unassigned, waiting, stages } = input;
  const parts: StoryPart[] = [{ text: `${fmt(all)} leads.`, strong: true }];
  if (stages && all > 0) {
    const engaged = n(stages.engaged);
    const up = QUALIFIED_UP.reduce((s, k) => s + n(stages[k]), 0);
    const pct = Math.round((up / all) * 100);
    if (engaged > up) {
      parts.push({ text: ` ${fmt(engaged)} are talking to you but haven't said which course or when, so only ` });
      parts.push({ text: `${fmt(up)} (${pct}%)`, strong: true });
      parts.push({ text: " have reached Qualified or beyond." });
    } else {
      parts.push({ text: " " }, { text: `${fmt(up)} (${pct}%)`, strong: true }, { text: " have reached Qualified or beyond." });
    }
  }
  const tail: StoryPart[] = [];
  if (waiting) tail.push({ text: ` ${fmt(waiting)} are waiting for a reply`, strong: true });
  if (unassigned > 0 && unassigned >= all * 0.5) {
    tail.push({ text: tail.length ? " and " : " " }, { text: `${fmt(unassigned)} have no owner`, strong: true });
  }
  if (tail.length) parts.push(...tail, { text: "." });
  return parts;
}

/** The one stage step where most leads stop, in words; null when nothing stands out. */
export function biggestGap(stages: StageCounts | null): { from: string; to: string; count: number; advice: string } | null {
  if (!stages) return null;
  const engaged = n(stages.engaged);
  const qualified = n(stages.qualified) + n(stages.high_intent);
  if (engaged >= 20 && engaged > qualified * 3) {
    return {
      from: "Engaged", to: "Qualified", count: engaged,
      advice: `${fmt(engaged)} are chatting but haven't named a course and month. Asking “Which course and month?” in the first reply moves them on.`,
    };
  }
  const hi = n(stages.high_intent);
  const pay = n(stages.payment_pending);
  if (hi >= 10 && hi > (pay + n(stages.enrolled)) * 4) {
    return {
      from: "High intent", to: "Payment pending", count: hi,
      advice: `${fmt(hi)} are keen but haven't started paying. Send the batch dates, fee and how to reserve a seat.`,
    };
  }
  return null;
}
