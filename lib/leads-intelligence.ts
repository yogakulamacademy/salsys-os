// Smart Leads briefing (owner-approved mockup "Leads v2", 25 Nov 2026).
// Pure functions over the leads_intelligence_v1 summary: ranked suggestions,
// comparisons with a usual week, and unusual days. No server imports.

export type DailyPoint = { d: string; total: number; instagram: number; website: number; other: number; fromAd: number; qualified: number };
export type WeekRow = { wkAgo: number; n: number; qualified: number; wrote: number; replied: number; medianReplyMin: number | null };
export type CourseRow = { name: string; courseId: string | null; w: [number, number, number, number]; n35: number; q35: number; openInr: number | null };
export type LeadsIntelligence = {
  generatedAt: string;
  daily: DailyPoint[];
  weeks: WeekRow[];
  replyEffect: { repliedN: number; repliedQ: number; noneN: number; noneQ: number };
  courses: CourseRow[];
  waiting: { n: number; askedFee: number; inWindow: number };
  pipeline: { n: number; inr: number };
};

export type Channel = "all" | "instagram" | "website";
export const valueOf = (p: DailyPoint, ch: Channel) => (ch === "all" ? p.total : p[ch]);

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2);
  return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : 0;
};
const quantile = (xs: number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return 0;
  const pos = (s.length - 1) * q; const lo = Math.floor(pos); const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
};

export type BandPoint = { d: string; value: number; low: number; high: number; mid: number; flag: "high" | "low" | null };

/** Usual range per day = middle half of the 14 days before it. Days far outside it are flagged. */
export function normalBand(daily: DailyPoint[], ch: Channel = "all"): BandPoint[] {
  const vals = daily.map((p) => valueOf(p, ch));
  return daily.map((p, i) => {
    const hist = vals.slice(Math.max(0, i - 14), i);
    if (hist.length < 7) return { d: p.d, value: vals[i], low: vals[i], high: vals[i], mid: vals[i], flag: null };
    const low = quantile(hist, 0.25); const high = quantile(hist, 0.75); const mid = median(hist);
    const v = vals[i];
    // Only judge days that have a real usual level (not the first days of data).
    const flag = mid < 3 ? null : v > high * 1.6 + 3 ? "high" : (low >= 5 && v < low * 0.55 ? "low" : null);
    return { d: p.d, value: v, low, high, mid, flag };
  });
}

export type UnusualRun = { from: string; to: string; direction: "high" | "low"; days: number; total: number; usualPerDay: number; instagram: number; website: number; fromAd: number;
  /** Average people a day from an ad in the 14 days before the run started. */
  usualFromAdPerDay: number };

/** Consecutive flagged days, newest first. The last (incomplete) day is never flagged. */
export function unusualRuns(daily: DailyPoint[], band: BandPoint[]): UnusualRun[] {
  const runs: UnusualRun[] = [];
  let cur: UnusualRun | null = null;
  const lastIdx = band.length - 1;
  band.forEach((b, i) => {
    const flag = i === lastIdx ? null : b.flag;
    if (flag && cur && cur.direction === flag) {
      cur.to = b.d; cur.days += 1; cur.total += b.value; cur.usualPerDay = (cur.usualPerDay * (cur.days - 1) + b.mid) / cur.days;
      cur.instagram += daily[i].instagram; cur.website += daily[i].website; cur.fromAd += daily[i].fromAd;
    } else {
      if (cur) runs.push(cur);
      const before = daily.slice(Math.max(0, i - 14), i);
      const usualFromAdPerDay = before.length ? before.reduce((s, p) => s + p.fromAd, 0) / before.length : 0;
      cur = flag ? { from: b.d, to: b.d, direction: flag, days: 1, total: b.value, usualPerDay: b.mid, instagram: daily[i].instagram, website: daily[i].website, fromAd: daily[i].fromAd, usualFromAdPerDay } : null;
    }
  });
  if (cur) runs.push(cur);
  return runs.reverse();
}

export type Kpis = {
  newThisWeek: number; newUsualWeek: number; newSpark: number[];
  replyRate: number | null; replySpark: number[];
  qualRate: number | null; qualEarlier: [number, number] | null; qualSpark: number[];
  pipelineInr: number; pipelineN: number;
};

const sumRange = (xs: number[], from: number, to: number) => xs.slice(Math.max(0, from), Math.max(0, to)).reduce((a, b) => a + b, 0);

export function kpis(i: LeadsIntelligence): Kpis {
  const t = i.daily.map((p) => p.total); const n = t.length;
  const wk = (k: number) => sumRange(t, n - 7 * (k + 1), n - 7 * k);
  const prior = [wk(1), wk(2), wk(3)];
  const byAgo = new Map(i.weeks.map((w) => [w.wkAgo, w]));
  const rate = (w: WeekRow | undefined, num: "replied" | "qualified", den: "wrote" | "n") => (w && w[den] > 0 ? w[num] / w[den] : null);
  // Weeks 1–3 are complete enough to judge replies; qualification needs ~9 days.
  const replySpark = [3, 2, 1].map((k) => rate(byAgo.get(k), "replied", "wrote")).filter((x): x is number => x != null);
  const qualSpark = [4, 3, 2, 1].map((k) => rate(byAgo.get(k), "qualified", "n")).filter((x): x is number => x != null);
  const earlier = [rate(byAgo.get(3), "qualified", "n"), rate(byAgo.get(4), "qualified", "n")].filter((x): x is number => x != null);
  return {
    newThisWeek: wk(0), newUsualWeek: Math.round(prior.reduce((a, b) => a + b, 0) / prior.length),
    newSpark: [wk(3), wk(2), wk(1), wk(0)],
    replyRate: replySpark.length ? replySpark.reduce((a, b) => a + b, 0) / replySpark.length : null, replySpark,
    qualRate: rate(byAgo.get(1), "qualified", "n"),
    qualEarlier: earlier.length ? [Math.min(...earlier), Math.max(...earlier)] : null,
    qualSpark,
    pipelineInr: i.pipeline.inr, pipelineN: i.pipeline.n,
  };
}

export type CourseTrend = { name: string; courseId: string | null; known: boolean; weeks: number[]; now: number; usual: number; change: number | null; qualifiedShare: number; openInr: number | null };

export function courseTrends(i: LeadsIntelligence, limit = 6): CourseTrend[] {
  return i.courses
    .filter((c) => c.n35 >= 5)
    .map((c) => {
      const usual = (c.w[0] + c.w[1] + c.w[2]) / 3;
      return {
        name: c.name || "Course not known yet", courseId: c.courseId, known: Boolean(c.name),
        weeks: [...c.w], now: c.w[3], usual: Math.round(usual),
        change: usual >= 3 ? (c.w[3] - usual) / usual : null,
        qualifiedShare: c.n35 ? c.q35 / c.n35 : 0, openInr: c.openInr,
      };
    })
    .sort((a, b) => Number(b.known) - Number(a.known) || b.usual - a.usual)
    .slice(0, limit);
}

export type Suggestion = {
  key: "reply" | "demand" | "unknown_course";
  impact: string; title: string; body: string;
  evidence: Array<{ label: string; value: number; text: string; tone: "good" | "bad" | "neutral" | "brand" }>;
  action: { label: string; href: string };
  basis: string;
  score: number;
};

const pct = (x: number) => `${Math.round(x * 100)}%`;

export function suggestions(i: LeadsIntelligence): Suggestion[] {
  const out: Suggestion[] = [];
  const e = i.replyEffect;
  const qr = e.repliedN ? e.repliedQ / e.repliedN : 0;
  const qn = e.noneN ? e.noneQ / e.noneN : 0;
  if (i.waiting.n > 0) {
    const extra = qr > qn ? Math.round(i.waiting.n * (qr - qn)) : 0;
    out.push({
      key: "reply",
      impact: extra > 0 ? `≈ ${extra} MORE QUALIFIED IF ANSWERED` : `${i.waiting.n} WAITING ON US`,
      title: `Reply to the ${i.waiting.n} people waiting on us`,
      body: qn > 0 && qr > qn
        ? `People who get a reply are ${(qr / qn).toFixed(1)}× as likely to become Qualified (${pct(qr)} vs ${pct(qn)}).${i.waiting.askedFee ? ` ${i.waiting.askedFee} of them opened by asking the fee.` : ""}`
        : `${i.waiting.inWindow} wrote in the last 24 hours, so Instagram still lets us reply.`,
      evidence: [
        { label: "Got a reply", value: qr, text: pct(qr), tone: "good" },
        { label: "No reply seen", value: qn, text: pct(qn), tone: "neutral" },
      ],
      action: { label: `Open the ${i.waiting.n}`, href: "/conversations?filter=waiting" },
      basis: `Based on ${(e.repliedN + e.noneN).toLocaleString("en-IN")} chats from the last 60 days · ${i.waiting.inWindow} still inside Instagram’s 24-hour window`,
      score: extra * 3 + i.waiting.n,
    });
  }

  const trends = courseTrends(i, 20).filter((c) => c.known && c.usual >= 10 && c.change != null);
  const down = trends.filter((c) => (c.change ?? 0) <= -0.4).sort((a, b) => (a.change ?? 0) - (b.change ?? 0));
  const steady = trends.filter((c) => (c.change ?? 0) > -0.15).sort((a, b) => (b.change ?? 0) - (a.change ?? 0));
  if (down.length) {
    const lost = Math.round(down.reduce((s, c) => s + (c.usual - c.now), 0));
    out.push({
      key: "demand",
      impact: `≈ ${lost} FEWER ENQUIRIES THAN A USUAL WEEK`,
      title: down.length === 1 ? `Enquiries for ${down[0].name} dropped this week` : `Enquiries for ${down.length} courses dropped this week`,
      body: steady.length
        ? `${steady[0].name} held up, so it isn’t all channels. Check whether the ads or posts for these courses changed or stopped.`
        : "Check whether the ads or posts for these courses changed or stopped.",
      evidence: [...down.slice(0, 3), ...steady.slice(0, 1)].map((c) => ({ label: c.name, value: Math.abs(c.change ?? 0), text: `${(c.change ?? 0) > 0 ? "+" : "−"}${Math.round(Math.abs(c.change ?? 0) * 100)}%`, tone: (c.change ?? 0) < 0 ? "bad" as const : "good" as const })),
      action: { label: "See courses below", href: "#leads-courses" },
      basis: "Last 7 days vs the average of the 3 weeks before",
      score: lost * 2,
    });
  }

  const unknown = i.courses.find((c) => !c.name);
  const weekTotal = i.courses.reduce((s, c) => s + c.w[3], 0);
  if (unknown && weekTotal >= 20 && unknown.w[3] / weekTotal >= 0.3) {
    out.push({
      key: "unknown_course",
      impact: `CAN’T QUOTE A FEE FOR ${unknown.w[3]} PEOPLE`,
      title: `${pct(unknown.w[3] / weekTotal)} of this week’s people haven’t said which course`,
      body: "The first reply should ask which course and send that course’s fee for their location, in one message.",
      evidence: [
        { label: "Said the course", value: weekTotal - unknown.w[3], text: String(weekTotal - unknown.w[3]), tone: "brand" },
        { label: "Didn’t say", value: unknown.w[3], text: String(unknown.w[3]), tone: "bad" },
      ],
      action: { label: "Review the AI’s first reply", href: "/settings/ai-learning" },
      basis: "Last 7 days · course worked out from the chat",
      score: unknown.w[3],
    });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 3);
}

/** One or two sentences for the page header. */
export function headline(i: LeadsIntelligence): Array<{ text: string; strong?: boolean }> {
  const k = kpis(i);
  const parts: Array<{ text: string; strong?: boolean }> = [];
  const diff = k.newUsualWeek ? (k.newThisWeek - k.newUsualWeek) / k.newUsualWeek : 0;
  if (Math.abs(diff) >= 0.15) {
    parts.push({ text: "This week " });
    parts.push({ text: `${diff < 0 ? "fewer" : "more"} people wrote than usual (${k.newThisWeek.toLocaleString("en-IN")} vs ≈ ${k.newUsualWeek.toLocaleString("en-IN")})`, strong: true });
  } else {
    parts.push({ text: `This week ${k.newThisWeek.toLocaleString("en-IN")} people wrote, about a usual week` });
  }
  if (i.waiting.n) {
    parts.push({ text: `, and ` });
    parts.push({ text: `${i.waiting.n.toLocaleString("en-IN")} are waiting on our reply`, strong: true });
    parts.push({ text: ". Replying to them is the biggest win available today." });
  } else {
    parts.push({ text: "." });
  }
  return parts;
}
