// Marketing › Website › Clicks and forms: "How people move between pages" and
// "What people do on each page" (owner-approved 26 Nov 2026; replaces the open
// behaviour explorer). Pure helpers over marketing_behavior_detail_v1.

import type { PageSignal, Part } from "@/lib/marketing-pages";

export type BehaviorDetail = {
  days: number; visits: number; multiPage: number;
  moves: Array<{ from: string; to: string; n: number; sessions: number }>;
  pages: Array<{ path: string; visits: number; price: number; formStarted: number; formSent: number; contact: number; dates: number; enrol: number; brochure: number; faq: number; media: number; exits: number }>;
};
export type MoveRow = { key: string; from: string; to: string; visits: number; back: number };
export type PageRow = { path: string; label: string; visits: number; fees: number; dates: number; started: number; sent: number; left: number };
export type MoveAction = { id: string; title: string; body: string; basis: string };
export type BehaviorStory = { headline: Part[]; moves: MoveRow[]; pages: PageRow[]; actions: MoveAction[]; signals: PageSignal[]; visits: number; days: number };

const n = (x: number) => Math.round(Number(x) || 0).toLocaleString("en-IN");
const isHome = (p: string) => p === "/" || p === "" || /^\/index\.(php|html?)$/.test(p);
const isCourse = (p: string) => /^\/courses\/.+\//.test(p);
const isList = (p: string) => /^\/courses(\.php|\/?)$/.test(p);
const the = (label: string) => (label === "Home page" ? "the Home page" : label === "All courses list" ? "the all-courses list" : label);

export function isBehaviorDetail(v: unknown): v is BehaviorDetail {
  const d = v as BehaviorDetail | null;
  return Boolean(d && Array.isArray(d.moves) && Array.isArray(d.pages) && typeof d.visits !== "undefined");
}

export function buildBehaviorStory(d: BehaviorDetail, pageLabel: (p: string) => string): BehaviorStory {
  const label = (p: string) => (isHome(p) ? "Home page" : pageLabel(p));
  const key = (a: string, b: string) => `${a}→${b}`;
  const bySessions = new Map(d.moves.map((m) => [key(m.from, m.to), Number(m.sessions)]));
  // A move and its reverse are one row: the bigger direction, with the reverse as "came back".
  const moves: MoveRow[] = d.moves
    .filter((m) => { const rev = bySessions.get(key(m.to, m.from)) ?? 0; return Number(m.sessions) > rev || (Number(m.sessions) === rev && m.from < m.to); })
    .map((m) => ({ key: key(m.from, m.to), from: label(m.from), to: label(m.to), visits: Number(m.sessions), back: bySessions.get(key(m.to, m.from)) ?? 0 }));
  const pages: PageRow[] = d.pages.map((p) => ({ path: p.path, label: label(p.path), visits: Number(p.visits), fees: Number(p.price), dates: Number(p.dates), started: Number(p.formStarted), sent: Number(p.formSent), left: Number(p.exits) }));

  const actions: MoveAction[] = [];
  // 1. A page people open and immediately leave again, back where they came from.
  const bounce = d.moves.filter((m) => Number(m.sessions) >= 15).map((m) => ({ m, back: bySessions.get(key(m.to, m.from)) ?? 0 }))
    .filter((x) => x.back >= Number(x.m.sessions) * 0.4 && (isHome(x.m.from) || isList(x.m.to)))
    .sort((a, b) => b.m.sessions - a.m.sessions)[0];
  if (bounce) {
    const to = label(bounce.m.to);
    actions.push({ id: "bounce", title: `${to === "All courses list" ? "The all-courses list" : to} sends people back`,
      body: `${n(bounce.m.sessions)} visits went from ${the(label(bounce.m.from))} to ${the(to)}, and ${n(bounce.back)} went straight back. ${isList(bounce.m.to) ? "Show each course’s place, next date and fee on the list so people can pick one there." : "Make the next step on that page clearer."}`,
      basis: `Page moves, last ${d.days} days` });
  }
  // 2. People comparing course pages.
  const compare = d.moves.filter((m) => isCourse(m.from) && isCourse(m.to) && Number(m.sessions) >= 8).sort((a, b) => b.sessions - a.sessions).slice(0, 3);
  if (compare.length) actions.push({ id: "compare", title: "People compare courses side by side",
    body: `${compare.map((m) => `${label(m.from)} → ${label(m.to)} (${n(m.sessions)})`).join(", ")}. A short “which course is right for me” table on these pages would save them the back-and-forth.`,
    basis: `Page moves, last ${d.days} days` });
  // 3. A course page where people check the fees but don't send a form.
  const fees = pages.filter((p) => isCourse(p.path) && p.visits >= 50 && p.fees >= 10 && p.sent / Math.max(p.fees, 1) <= 0.35)
    .sort((a, b) => (b.fees - b.sent) - (a.fees - a.sent))[0];
  if (fees) actions.push({ id: "fees", title: `${fees.label}: fees checked, few enquiries`,
    body: `${n(fees.fees)} visits looked at the fees and ${n(fees.sent)} sent a form${fees.started > fees.sent ? ` (${n(fees.started - fees.sent)} started one and gave up)` : ""}. Show how to pay (instalments, WhatsApp for questions) right next to the fees.`,
    basis: `Clicks on the page, last ${d.days} days` });

  const multiShare = d.visits ? Math.round((d.multiPage / d.visits) * 100) : 0;
  const headline: Part[] = [{ text: `${n(d.multiPage)} of ${n(d.visits)} visits (${multiShare}%) looked at more than one page in the last ${d.days} days.`, strong: true }];
  if (bounce) {
    const r = bounce.back / Math.max(Number(bounce.m.sessions), 1);
    headline.push({ text: ` The most common move is ${the(label(bounce.m.from))} → ${the(label(bounce.m.to))}, and ${r >= 0.45 && r <= 0.55 ? "about half" : `${Math.round(r * 100)}%`} of those come straight back.` });
  }
  else if (moves[0]) headline.push({ text: ` The most common move is ${the(moves[0].from)} → ${the(moves[0].to)} (${n(moves[0].visits)} visits).` });

  const signals: PageSignal[] = [];
  const leaky = pages.filter((p) => p.visits >= 80 && !isHome(p.path) && p.sent / p.visits < 0.03).map((p) => ({ p, share: p.left / p.visits })).sort((a, b) => b.share - a.share)[0];
  if (leaky && leaky.share >= 0.6) signals.push({ id: "leaves", tag: "Noticed", tone: "amber", title: `${Math.round(leaky.share * 100)}% of visits to ${the(leaky.p.label)} end there`,
    summary: `${n(leaky.p.left)} of ${n(leaky.p.visits)} visits left the website from this page.`, detail: leaky.p.sent ? `${n(leaky.p.sent)} of them sent a form first, which is a good way to leave.` : "None of them sent a form. A clear next step (dates, fees, WhatsApp) would keep more of them." });
  const best = pages.filter((p) => isCourse(p.path) && p.visits >= 50).sort((a, b) => b.sent / b.visits - a.sent / a.visits)[0];
  if (best && best.sent) signals.push({ id: "best", tag: "Noticed", tone: "teal", title: `${best.label} turns the most visits into forms`,
    summary: `${n(best.sent)} forms from ${n(best.visits)} visits (${Math.round((best.sent / best.visits) * 100)} in 100).`, detail: "Look at where its form sits and what it asks, and try the same on the other course pages." });
  return { headline, moves: moves.slice(0, 15), pages, actions, signals, visits: Number(d.visits), days: Number(d.days) };
}
