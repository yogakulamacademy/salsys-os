// Smart Tasks & follow-ups briefing (owner-approved mockup "Smart Tasks",
// 25 Nov 2026). Pure helpers: every number comes from live task data.

export type TaskFact = {
  id: string;
  leadId: string;
  createdAt: string;
  completedAt: string | null;
  status: string;
  dueAt: string | null;
  title: string;
  ownerName: string | null;
  /** We replied after the follow-up was created and they have not written since. */
  answered: boolean;
};

export type DayCount = { day: string; created: number; done: number };
export type FlaggedDay = { day: string; created: number; top: Array<{ title: string; n: number }> };
export type TasksIntelligence = {
  windowDays: number;
  created: number;
  done: number;
  open: number;
  late: number;
  lateThisWeek: number;
  dueToday: number;
  dueTodayPast: number;
  noOwner: number;
  answeredIds: string[];
  daily: DayCount[];
  flagged: FlaggedDay[];
  owners: Array<{ name: string; n: number }>;
};

const DAY = 86_400_000;
const istDay = (iso: string) => new Date(new Date(iso).getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10);
const isOpen = (t: TaskFact) => t.status === "open" || t.status === "snoozed";

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function buildTasksIntelligence(facts: TaskFact[], now = new Date(), windowDays = 21): TasksIntelligence {
  const nowMs = now.getTime();
  const since = nowMs - windowDays * DAY;
  const today = istDay(now.toISOString());

  const days: DayCount[] = [];
  for (let i = windowDays - 1; i >= 0; i -= 1) days.push({ day: istDay(new Date(nowMs - i * DAY).toISOString()), created: 0, done: 0 });
  const byDay = new Map(days.map((d) => [d.day, d]));
  const titlesByDay = new Map<string, Map<string, number>>();

  let created = 0;
  let done = 0;
  for (const t of facts) {
    const c = Date.parse(t.createdAt);
    if (c >= since) {
      created += 1;
      const d = byDay.get(istDay(t.createdAt));
      if (d) {
        d.created += 1;
        const m = titlesByDay.get(d.day) ?? new Map<string, number>();
        m.set(t.title, (m.get(t.title) ?? 0) + 1);
        titlesByDay.set(d.day, m);
      }
    }
    if (t.status === "completed" && t.completedAt && Date.parse(t.completedAt) >= since) {
      done += 1;
      const d = byDay.get(istDay(t.completedAt));
      if (d) d.done += 1;
    }
  }

  const open = facts.filter(isOpen);
  const late = open.filter((t) => t.dueAt && Date.parse(t.dueAt) < nowMs);
  const dueToday = open.filter((t) => t.dueAt && istDay(t.dueAt) === today);

  // A day is flagged when far above the usual day (at least 3× the median and 10 more).
  const usual = median(days.map((d) => d.created));
  const flagged = days
    .filter((d) => d.created >= Math.max(3 * usual, usual + 10))
    .sort((a, b) => b.created - a.created)
    .slice(0, 2)
    .map((d) => ({
      day: d.day,
      created: d.created,
      top: [...(titlesByDay.get(d.day) ?? new Map()).entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([title, n]) => ({ title, n })),
    }));

  const ownerCount = new Map<string, number>();
  for (const t of open) ownerCount.set(t.ownerName ?? "", (ownerCount.get(t.ownerName ?? "") ?? 0) + 1);
  const owners = [...ownerCount.entries()]
    .map(([name, n]) => ({ name: name || "Nobody yet", n }))
    .sort((a, b) => Number(b.name === "Nobody yet") - Number(a.name === "Nobody yet") || b.n - a.n)
    .slice(0, 6);

  return {
    windowDays,
    created,
    done,
    open: open.length,
    late: late.length,
    lateThisWeek: late.filter((t) => Date.parse(t.dueAt!) >= nowMs - 7 * DAY).length,
    dueToday: dueToday.length,
    dueTodayPast: dueToday.filter((t) => Date.parse(t.dueAt!) < nowMs).length,
    noOwner: open.filter((t) => !t.ownerName).length,
    answeredIds: open.filter((t) => t.answered && t.dueAt && Date.parse(t.dueAt) <= nowMs + 7 * DAY).map((t) => t.id),
    daily: days,
    flagged,
    owners,
  };
}

export function tasksHeadline(i: TasksIntelligence): string {
  if (!i.created) return "No follow-ups were created in the last three weeks.";
  const rate = i.done / i.created;
  const lead = `${i.created.toLocaleString("en-IN")} follow-ups were created in ${i.windowDays / 7} weeks and ${i.done.toLocaleString("en-IN")} were marked done.`;
  if (rate >= 0.6) return `${lead} The list is being kept up.`;
  return `${lead} Most replies happen in the chats and never get ticked off, so the list keeps growing.`;
}

export function doneShare(i: TasksIntelligence): number {
  return i.created ? i.done / i.created : 0;
}
