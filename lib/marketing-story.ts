// Smart Marketing Overview (owner-approved prototype "Marketing prototype",
// 25 Nov 2026). Pure helpers over marketing_story_v1: one ready-to-render view
// per channel filter (All, then each channel with enough enquiries), so the
// page can switch channels without another request. Every number is counted
// from the business's own records; nothing here is estimated by AI.

export type ChannelKey = "instagram" | "website" | "whatsapp" | "other";
export type FilterKey = "all" | ChannelKey;

export type MarketingStoryData = {
  days: number;
  totals: Array<{ channel: ChannelKey; n: number; warm: number; paid: number; withCampaign?: number }>;
  weeks: Array<{ week: string; channel: ChannelKey; n: number }>;
  firstSeen: Array<{ channel: ChannelKey; at: string }>;
  courses: Array<{ course: string; channel: ChannelKey; n: number; warm: number }>;
  sources: Array<{ source: string; channel: ChannelKey; n: number; warm: number; paid: number }>;
  speed: Array<{ channel: ChannelKey; bucket: SpeedBucket; n: number; warm: number }>;
  aiReferrals: Array<{ month: string; n: number }>;
  noCountry: number;
  ads: {
    meta: { lastStatus: string | null; lastRunAt: string | null; lastSuccessAt: string | null };
    google: { lastStatus: string | null; lastRunAt: string | null; lastSuccessAt: string | null };
    spendLastDay: string | null;
  };
};

/** Website form steps from the behaviour funnel (sessions, 14 days). */
export type FormFunnel = { viewed: number; started: number; submitted: number } | null;

export type SpeedBucket = "m15" | "h2" | "h24" | "later" | "never";
export const SPEED_LABEL: Record<SpeedBucket, string> = {
  m15: "Within 15 min", h2: "15 min – 2 h", h24: "2 – 24 h", later: "After a day", never: "Never answered",
};
const SPEED_ORDER: SpeedBucket[] = ["m15", "h2", "h24", "later", "never"];

export const CHANNEL_LABEL: Record<FilterKey, string> = {
  all: "All", instagram: "Instagram", website: "Website", whatsapp: "WhatsApp", other: "Other",
};

export type Part = { text: string; strong?: boolean };
export type BarRow = { label: string; value: number; shown: string; tone: "brand" | "soft" | "red" | "amber" | "green" | "teal" };
export type Rank = {
  id: string; impact: string; title: string; bars: BarRow[]; max?: number; body: Part[];
  actions: Array<{ label: string; href: string; primary?: boolean }>; basis: string;
};
export type Kpi = { label: string; value: string; sub: string; badge?: { text: string; tone: "good" | "bad" } };
export type Signal = { id: string; tag: string; tone: "teal" | "red" | "amber" | "muted"; title: string; summary: string; detail: string };
export type WeekRow = { week: string; label: string; byChannel: Partial<Record<ChannelKey, number>>; total: number; imported: ChannelKey | null; partial: boolean };
export type CourseRow = { course: string; n: number; warm: number; byChannel: Array<{ channel: ChannelKey; n: number; warm: number }> };
export type SourceRow = { label: string; channel: ChannelKey; n: number; warm: number; paid: number };

export type MarketingView = {
  key: FilterKey;
  label: string;
  headline: Part[];
  ranks: Rank[];
  kpis: Kpi[];
  weeks: WeekRow[];
  channels: ChannelKey[];
  courses: CourseRow[];
  speed: Array<{ bucket: SpeedBucket; label: string; n: number; warm: number }> | null;
  speedNote: string;
  sources: SourceRow[];
  signals: Signal[];
};

export type MarketingStory = { filters: FilterKey[]; views: Record<string, MarketingView>; days: number };

const WARM_HINT = "reached Qualified or later";
const n = (x: number) => Math.round(x).toLocaleString("en-IN");
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const DAY = 86_400_000;

export function isMarketingStoryData(v: unknown): v is MarketingStoryData {
  const d = v as MarketingStoryData | null;
  return Boolean(d && Array.isArray(d.totals) && Array.isArray(d.weeks) && Array.isArray(d.courses) && Array.isArray(d.sources) && Array.isArray(d.speed) && d.ads);
}

export function weekLabel(week: string): string {
  return new Date(`${week}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
}

function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
}

/** Plain name for a first-touch source; website sources say how people got to the site. */
export function sourceLabel(source: string, channel: ChannelKey): string {
  const s = source.toLowerCase();
  let name: string;
  if (/chatgpt|openai/.test(s)) name = "ChatGPT";
  else if (/perplexity/.test(s)) name = "Perplexity";
  else if (/gemini\.google/.test(s)) name = "Gemini";
  else if (/google/.test(s)) name = "Google search";
  else if (/bing/.test(s)) name = "Bing search";
  else if (s === "ig" || /instagram/.test(s)) name = channel === "instagram" ? "Instagram messages" : "Link from Instagram";
  else if (/facebook|fb\b|^m\.facebook|l\.facebook/.test(s)) name = "Facebook";
  else if (/whatsapp|wa\.me/.test(s)) name = "WhatsApp";
  else if (s === "direct" || s === "unknown" || s === "(direct)") name = "Typed the address / unknown";
  else name = source;
  return channel === "website" && name !== "Instagram messages" ? `Website · ${name}` : name;
}

/** The last five Monday weeks (IST), oldest first, ending with the current one. */
function weekKeys(now: Date): string[] {
  const ist = new Date(now.getTime() + 330 * 60_000);
  const dow = (ist.getUTCDay() + 6) % 7;
  const monday = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - dow * DAY;
  return [4, 3, 2, 1, 0].map((k) => new Date(monday - k * 7 * DAY).toISOString().slice(0, 10));
}

function buildWeeks(d: MarketingStoryData, now: Date): WeekRow[] {
  const keys = weekKeys(now);
  return keys.map((week, i) => {
    const byChannel: Partial<Record<ChannelKey, number>> = {};
    for (const r of d.weeks) if (r.week === week) byChannel[r.channel] = (byChannel[r.channel] ?? 0) + Number(r.n);
    const start = Date.parse(`${week}T00:00:00+05:30`);
    // A channel connected during this week brings its older conversations in with it.
    const imported = d.firstSeen.find((f) => {
      const t = Date.parse(f.at);
      return t >= start && t < start + 7 * DAY && (byChannel[f.channel] ?? 0) >= 50;
    })?.channel ?? null;
    return { week, label: weekLabel(week), byChannel, total: sum(Object.values(byChannel).map(Number)), imported, partial: i === keys.length - 1 };
  });
}

function inFilter(ch: ChannelKey, f: FilterKey) {
  return f === "all" || ch === f;
}

function weekTotal(w: WeekRow, f: FilterKey) {
  return f === "all" ? w.total : (w.byChannel[f] ?? 0);
}

/** Compare the last full week with the first full week that wasn't a channel import. */
function weekTrend(weeks: WeekRow[], f: FilterKey) {
  const full = weeks.filter((w) => !w.partial);
  const base = full.find((w) => !w.imported) ?? null;
  const last = full[full.length - 1] ?? null;
  if (!base || !last || base === last) return null;
  const from = weekTotal(base, f), to = weekTotal(last, f);
  return { base, last, from, to, change: from ? (to - from) / from : null };
}

function speedFor(d: MarketingStoryData, f: FilterKey) {
  const rows = SPEED_ORDER.map((bucket) => {
    const r = d.speed.filter((x) => x.bucket === bucket && inFilter(x.channel, f) && channelRepliesInCrm(d, x.channel));
    return { bucket, label: SPEED_LABEL[bucket], n: sum(r.map((x) => Number(x.n))), warm: sum(r.map((x) => Number(x.warm))) };
  });
  const total = sum(rows.map((r) => r.n));
  return total >= 20 ? rows : null;
}

/** Website enquiries are usually answered by phone or email, outside the CRM inbox. */
function channelRepliesInCrm(d: MarketingStoryData, ch: ChannelKey) {
  const rows = d.speed.filter((x) => x.channel === ch);
  const total = sum(rows.map((x) => Number(x.n)));
  const never = sum(rows.filter((x) => x.bucket === "never").map((x) => Number(x.n)));
  return total > 0 && (total - never) / total >= 0.2;
}

function noReply(speed: ReturnType<typeof speedFor>) {
  if (!speed) return null;
  const never = speed.find((r) => r.bucket === "never")!;
  const replied = speed.filter((r) => r.bucket !== "never");
  const rn = sum(replied.map((r) => r.n)), rw = sum(replied.map((r) => r.warm));
  if (never.n < 10 || rn < 20) return null;
  const repliedRate = rw / rn, neverRate = never.warm / never.n;
  return { n: never.n, warm: never.warm, repliedRate, neverRate, uplift: Math.max(0, Math.round((repliedRate - neverRate) * never.n)), replied: rn, fast: speed[0].n, total: rn + never.n };
}

function coursesFor(d: MarketingStoryData, f: FilterKey): CourseRow[] {
  const map = new Map<string, CourseRow>();
  for (const r of d.courses) {
    if (!inFilter(r.channel, f)) continue;
    const name = r.course || "No course named";
    const row = map.get(name) ?? { course: name, n: 0, warm: 0, byChannel: [] };
    row.n += Number(r.n); row.warm += Number(r.warm);
    row.byChannel.push({ channel: r.channel, n: Number(r.n), warm: Number(r.warm) });
    map.set(name, row);
  }
  return [...map.values()].filter((r) => r.n >= 3).sort((a, b) => b.n - a.n);
}

function sourcesFor(d: MarketingStoryData): SourceRow[] {
  const map = new Map<string, SourceRow>();
  for (const r of d.sources) {
    const label = sourceLabel(r.source, r.channel);
    const row = map.get(`${r.channel}|${label}`) ?? { label, channel: r.channel, n: 0, warm: 0, paid: 0 };
    row.n += Number(r.n); row.warm += Number(r.warm); row.paid += Number(r.paid);
    map.set(`${r.channel}|${label}`, row);
  }
  return [...map.values()].sort((a, b) => b.n - a.n);
}

function adsState(d: MarketingStoryData, now: Date) {
  const stale = (at: string | null) => !at || now.getTime() - Date.parse(at) > 3 * DAY;
  const meta = d.ads.meta, google = d.ads.google;
  const metaKnown = Boolean(meta.lastRunAt), googleKnown = Boolean(google.lastRunAt);
  const metaBad = metaKnown && (meta.lastStatus === "failed" || stale(meta.lastRunAt) || stale(meta.lastSuccessAt));
  const googleBad = googleKnown && (google.lastStatus === "failed" || stale(google.lastSuccessAt));
  const word = (x: typeof meta) => x.lastStatus === "failed" ? "failing" : stale(x.lastRunAt) ? "stopped" : "stale";
  return { metaKnown, googleKnown, metaBad, googleBad, metaWord: word(meta), googleWord: word(google), meta, google };
}

export function buildMarketingStory(d: MarketingStoryData, form: FormFunnel, now = new Date()): MarketingStory {
  const weeks = buildWeeks(d, now);
  const total = (f: FilterKey) => {
    const rows = d.totals.filter((t) => inFilter(t.channel, f));
    return { n: sum(rows.map((r) => Number(r.n))), warm: sum(rows.map((r) => Number(r.warm))), paid: sum(rows.map((r) => Number(r.paid))), withCampaign: sum(rows.map((r) => Number(r.withCampaign ?? 0))) };
  };
  const all = total("all");
  const channels = d.totals.filter((t) => Number(t.n) > 0).sort((a, b) => Number(b.n) - Number(a.n)).map((t) => t.channel);
  const filters: FilterKey[] = ["all", ...channels.filter((c) => Number(d.totals.find((t) => t.channel === c)?.n ?? 0) >= Math.max(10, all.n * 0.03))];
  const ads = adsState(d, now);
  const sources = sourcesFor(d);
  const aiNow = d.aiReferrals[d.aiReferrals.length - 1];
  const aiBefore = d.aiReferrals.slice(0, -1);
  const views: Record<string, MarketingView> = {};

  for (const f of filters) {
    const T = total(f);
    const trend = weekTrend(weeks, f);
    const speed = speedFor(d, f);
    const nr = noReply(speed);
    const courses = coursesFor(d, f);
    const named = courses.filter((c) => c.course !== "No course named" && c.n >= 30);
    const unnamed = courses.find((c) => c.course === "No course named");
    const ranks: Rank[] = [];
    const signals: Signal[] = [];

    // Which channel drives the change (All view only).
    let driver: { channel: ChannelKey; delta: number; others: number } | null = null;
    if (f === "all" && trend) {
      const deltas = channels.map((c) => ({ c, delta: (trend.last.byChannel[c] ?? 0) - (trend.base.byChannel[c] ?? 0) }));
      const totalDelta = trend.to - trend.from;
      const top = deltas.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0];
      if (top && totalDelta && Math.sign(top.delta) === Math.sign(totalDelta) && Math.abs(top.delta) >= Math.abs(totalDelta) * 0.9) {
        driver = { channel: top.c, delta: top.delta, others: totalDelta - top.delta };
      }
    }

    // 1. People nobody answered.
    if (nr && nr.n >= 10) {
      ranks.push({
        id: "no-reply",
        impact: nr.uplift >= 3 ? `≈ ${n(nr.uplift)} more warm people` : `${n(nr.n)} never answered`,
        title: `Answer the ${n(nr.n)} people nobody replied to`,
        bars: [
          { label: `Got a reply · ${(nr.repliedRate * 100).toFixed(1)}% warm`, value: nr.repliedRate, shown: n(nr.replied), tone: "brand" },
          { label: `No reply · ${(nr.neverRate * 100).toFixed(1)}% warm`, value: nr.neverRate, shown: n(nr.n), tone: "red" },
        ],
        max: Math.max(nr.repliedRate, nr.neverRate),
        body: [
          { text: "People who got any reply " + WARM_HINT + " " },
          { text: nr.neverRate > 0 ? `${(nr.repliedRate / nr.neverRate).toFixed(1).replace(/\.0$/, "")} times as often` : "far more often", strong: true },
          { text: ` as people who got none.${nr.uplift >= 3 ? ` If the ${n(nr.n)} do as well once answered, that’s about ${n(nr.uplift)} more warm people.` : ""}${nr.warm ? ` ${n(nr.warm)} of them are already Qualified or further along.` : ""}` },
        ],
        actions: [{ label: `Open the ${n(nr.n)} in Inbox`, href: "/conversations?filter=waiting", primary: true }],
        basis: `First message in the last ${d.days} days · a reply is any message from us after it`,
      });
    }

    // 2. Topics that bring warm enquiries (or a course that never turns warm on this channel).
    const gap = f !== "all" ? findCourseGap(d, f) : null;
    if (gap) {
      ranks.push({
        id: "course-gap",
        impact: `0 warm from ${n(gap.n)}`,
        title: `Check the ${gap.course} page`,
        bars: [
          { label: `${gap.course} · ${CHANNEL_LABEL[gap.otherChannel]}`, value: gap.otherRate, shown: `${Math.round(gap.otherRate * 100)}% warm`, tone: "brand" },
          { label: `${gap.course} · ${CHANNEL_LABEL[f]}`, value: 0, shown: "0%", tone: "teal" },
        ],
        max: gap.otherRate,
        body: [{ text: `${n(gap.n)} people asked about ${gap.course} through the ${CHANNEL_LABEL[f].toLowerCase()} and ` }, { text: "none reached Qualified", strong: true }, { text: `, while ${Math.round(gap.otherRate * 100)}% of ${CHANNEL_LABEL[gap.otherChannel]} enquiries about it did. Check that the price, dates and certificate details match what the team quotes.` }],
        actions: [{ label: "Open Website", href: "/marketing?view=analytics", primary: true }],
        basis: `Course each enquiry asked about · last ${d.days} days`,
      });
    } else if (named.length >= 2) {
      const best = [...named].sort((a, b) => b.warm / b.n - a.warm / a.n);
      const top2 = best.slice(0, 2);
      // In the All view, talk about the channel that moved, with its own numbers.
      const mover = f === "all" && driver && trend ? { label: CHANNEL_LABEL[driver.channel], from: trend.base.byChannel[driver.channel] ?? 0, to: trend.last.byChannel[driver.channel] ?? 0 } : trend ? { label: f === "all" ? "Enquiries" : CHANNEL_LABEL[f], from: trend.from, to: trend.to } : null;
      const moverChange = mover && mover.from ? (mover.to - mover.from) / mover.from : null;
      const drop = moverChange !== null && moverChange <= -0.2;
      ranks.push({
        id: "topics",
        impact: drop ? `${mover!.label} ▼ ${Math.round(Math.abs(moverChange!) * 100)}% since ${trend!.base.label}` : "Warmest topics",
        title: `Post more about ${top2.map((c) => shortCourse(c.course)).join(" and ")}`,
        bars: best.slice(0, 4).map((c, i) => ({ label: `${shortCourse(c.course)} · warm`, value: c.warm / c.n, shown: `${pct(c.warm, c.n)}%`, tone: i < 2 ? "brand" : "soft" })),
        max: best[0].warm / best[0].n,
        body: [
          { text: drop ? `${mover!.label === "Enquiries" ? "New enquiries" : mover!.label} fell from ${n(mover!.from)} to ${n(mover!.to)} enquiries a week. ` : "" },
          { text: top2.map((c) => shortCourse(c.course)).join(" and "), strong: true },
          { text: ` bring the warmest enquiries, about 1 in ${Math.max(2, Math.round(top2[0].n / Math.max(1, top2[0].warm)))}, so they’re the best topics for the next posts and reels.` },
        ],
        actions: [{ label: "See courses below", href: "#marketing-courses", primary: true }],
        basis: `Course each enquiry asked about · last ${d.days} days`,
      });
    }

    // 3. Website form drop-off.
    if (form && form.started >= 10 && form.started - form.submitted >= 5 && (f === "website" || (f === "all" && ranks.length < 2))) {
      ranks.push({
        id: "form",
        impact: `${n(form.started - form.submitted)} started the form and left`,
        title: "Shorten the website enquiry form",
        bars: [
          { label: "Saw a page", value: form.viewed, shown: n(form.viewed), tone: "soft" },
          { label: "Started the form", value: form.started, shown: n(form.started), tone: "brand" },
          { label: "Sent it", value: form.submitted, shown: n(form.submitted), tone: "green" },
        ],
        max: Math.max(form.viewed, 1),
        body: [{ text: `Of ${n(form.started)} visitors who started the form in 14 days, ` }, { text: `${n(form.started - form.submitted)} left before sending it`, strong: true }, { text: ". A shorter form, or a WhatsApp button beside it, would keep some of them." }],
        actions: [{ label: "Open Website", href: "/marketing?view=behavior", primary: true }],
        basis: "Website form events, last 14 days",
      });
    }

    // 4. Ad connections.
    if (ads.metaBad || ads.googleBad) {
      const bars: BarRow[] = [];
      if (ads.metaKnown) bars.push({ label: `Meta Ads · last synced ${ads.meta.lastSuccessAt ? dayLabel(ads.meta.lastSuccessAt) : "never"}`, value: 1, shown: ads.metaBad ? ads.metaWord : "ok", tone: ads.metaBad ? "amber" : "green" });
      if (ads.googleKnown) bars.push({ label: `Google Ads · last synced ${ads.google.lastSuccessAt ? dayLabel(ads.google.lastSuccessAt) : "never"}`, value: 1, shown: ads.googleBad ? ads.googleWord : "ok", tone: ads.googleBad ? "red" : "green" });
      const which = [ads.metaBad ? "Meta" : null, ads.googleBad ? "Google" : null].filter(Boolean).join(" and ");
      ranks.push({
        id: "ads",
        impact: all.withCampaign === 0 ? `0 of ${n(all.n)} linked to an ad` : `${n(all.withCampaign)} of ${n(all.n)} linked to an ad`,
        title: `Reconnect ${which} Ads`,
        bars,
        body: [
          { text: `${d.ads.spendLastDay ? `Ad spend stops at ${dayLabel(`${d.ads.spendLastDay}T12:00:00Z`)}` : "No ad spend has synced"}${all.withCampaign === 0 ? " and no enquiry carries a campaign" : ""}, so ` },
          { text: driver && driver.delta < 0 ? `nobody can tell whether the ${CHANNEL_LABEL[driver.channel]} drop is because ads stopped` : "cost per enquiry and per enrolment can’t be worked out", strong: true },
          { text: ". Reconnecting shows what each enquiry costs." },
        ],
        actions: [{ label: "Open Integrations", href: "/settings/integrations", primary: true }],
        basis: "Meta Ads and Google Ads connection status",
      });
    }

    // Headline.
    const headline: Part[] = [];
    if (trend && trend.change !== null && Math.abs(trend.change) >= 0.2) {
      const dir = trend.change < 0 ? (trend.change <= -0.45 ? "halved" : "fallen") : "grown";
      headline.push({ text: `New ${f === "all" ? "" : CHANNEL_LABEL[f] + " "}enquiries have ${dir} since the week of ${trend.base.label} (${n(trend.from)} → ${n(trend.to)} a week)`, strong: true });
      if (driver) {
        const steady = channels.filter((c) => c !== driver!.channel && Number(d.totals.find((t) => t.channel === c)?.n ?? 0) >= 20);
        headline.push({ text: `, and the whole ${driver.delta < 0 ? "drop" : "rise"} is ${CHANNEL_LABEL[driver.channel]}${steady.length ? `; ${steady.map((c) => CHANNEL_LABEL[c].toLowerCase()).join(" and ")} ${steady.length > 1 ? "are" : "is"} steady` : ""}.`, strong: true });
      } else headline.push({ text: ".", strong: true });
    } else {
      headline.push({ text: `${n(T.n)} ${f === "all" ? "" : CHANNEL_LABEL[f] + " "}enquiries in the last ${d.days} days${trend ? `, steady at about ${n(trend.to)} a week` : ""}; ${pct(T.warm, T.n)}% became warm and ${n(T.paid)} paid.`, strong: true });
    }
    if (ranks[0]?.id === "no-reply" && nr) headline.push({ text: ` The quickest win isn’t more posts: ${n(nr.n)} people who messaged ${f === "all" ? "" : "on " + CHANNEL_LABEL[f] + " "}in the last ${d.days} days never got a reply.` });
    else if (ranks[0]?.id === "course-gap" && gap) headline.push({ text: ` ${gap.course} enquiries from the ${CHANNEL_LABEL[f].toLowerCase()} haven’t produced a single warm lead.` });

    // KPIs.
    const kpis: Kpi[] = [];
    if (trend) {
      const ch = trend.change;
      kpis.push({ label: "New enquiries last full week", value: n(trend.to), sub: `${n(trend.from)} in the week of ${trend.base.label}`,
        badge: ch === null ? undefined : { text: `${ch < 0 ? "▼" : "▲"} ${Math.abs(Math.round(ch * 100))}%`, tone: ch <= -0.1 ? "bad" : "good" } });
    } else kpis.push({ label: `Enquiries · ${d.days} days`, value: n(T.n), sub: "Not enough weeks to compare yet" });
    kpis.push({ label: "Become warm", value: `${pct(T.warm, T.n)}%`, sub: `${n(T.warm)} of ${n(T.n)} ${WARM_HINT}` });
    if (nr) kpis.push({ label: "Answered within 15 min", value: `${pct(nr.fast, nr.total)}%`, sub: `${n(nr.fast)} of ${n(nr.total)} · ${n(nr.n)} never answered`, badge: nr.n ? { text: `${n(nr.n)} missed`, tone: "bad" } : undefined });
    else if (form && form.started) kpis.push({ label: "Form finished", value: `${pct(form.submitted, form.started)}%`, sub: `${n(form.submitted)} of ${n(form.started)} who started it · 14 days`, badge: form.started > form.submitted ? { text: `${n(form.started - form.submitted)} left`, tone: "bad" } : undefined });
    kpis.push({ label: `Paid · ${d.days} days`, value: n(T.paid), sub: f === "all" ? channels.filter((c) => Number(d.totals.find((t) => t.channel === c)?.paid ?? 0) > 0).map((c) => `${n(Number(d.totals.find((t) => t.channel === c)?.paid))} from ${CHANNEL_LABEL[c]}`).join(" · ") || "None yet" : `From ${CHANNEL_LABEL[f]} enquiries` });

    // Signals.
    if (aiNow && aiNow.n >= 3 && aiBefore.every((m) => m.n < aiNow.n) && (f === "all" || f === "website")) {
      signals.push({ id: "ai", tag: "Rising", tone: "teal", title: "AI assistants are sending people to your website",
        summary: `${n(aiNow.n)} enquiries from ChatGPT and similar assistants this month${aiBefore.length ? `, up from ${aiBefore.map((m) => `${n(m.n)} in ${monthName(m.month)}`).reverse().join(" and ")}` : ""}.`,
        detail: "The Google search page shows which of your pages these visitors land on, so those pages can be kept accurate and up to date." });
    }
    if (form && form.started - form.submitted >= 5 && (f === "all" || f === "website")) {
      signals.push({ id: "form", tag: "Leak", tone: "red", title: `${n(form.started - form.submitted)} visitors started the website form and left`,
        summary: `${n(form.started)} started it in 14 days, ${n(form.submitted)} sent it.`,
        detail: `Form started ${n(form.started)} → sent ${n(form.submitted)} (${pct(form.submitted, form.started)}%). A WhatsApp button beside the form would catch people who don’t want to fill in fields.` });
    }
    if (unnamed && unnamed.n >= 20 && unnamed.n >= T.n * 0.1) {
      signals.push({ id: "no-course", tag: "Waste", tone: "amber", title: `${n(unnamed.n)} enquiries never named a course`,
        summary: `Mostly a “hi” or a shared post; only ${pct(unnamed.warm, unnamed.n)}% become warm.`,
        detail: "An automatic first reply asking which course they’re interested in, with the most-asked courses as quick buttons, would sort them and give the team something to answer." });
    }
    for (const c of filters.filter((x): x is ChannelKey => x !== "all")) {
      if (f !== "all" && f !== c) continue;
      const g = findCourseGap(d, c);
      if (g) signals.push({ id: `gap-${c}`, tag: "Gap", tone: "red", title: `${g.course} ${CHANNEL_LABEL[c].toLowerCase()} enquiries never turn warm`,
        summary: `0 of ${n(g.n)} ${CHANNEL_LABEL[c].toLowerCase()} enquiries vs ${Math.round(g.otherRate * 100)}% from ${CHANNEL_LABEL[g.otherChannel]}.`,
        detail: `Compare the price, dates and certificate details people see on ${CHANNEL_LABEL[c].toLowerCase()} with what the team says in chats; a mismatch often stops people at the first reply.` });
    }
    if (f === "all" && all.n >= 50 && d.noCountry >= all.n * 0.2) {
      signals.push({ id: "country", tag: "Missing", tone: "muted", title: `${n(d.noCountry)} enquiries have no country`,
        summary: `Country is only known for ${100 - pct(d.noCountry, all.n)}% of enquiries.`,
        detail: "Country comes from the chat or the form. A country field on the website form, and asking once in chat, would fill most of the gaps." });
    }

    let speedNote = "";
    if (speed && nr) {
      const fastRows = speed.filter((r) => r.bucket === "m15" || r.bucket === "h2");
      const lo = Math.min(...fastRows.map((r) => pct(r.warm, r.n))), hi = Math.max(...fastRows.map((r) => pct(r.warm, r.n)));
      speedNote = `Answered within 2 hours: ${lo === hi ? `${lo}%` : `${lo}–${hi}%`} become warm. Never answered: ${pct(nr.warm, nr.n)}%.`;
    } else speedNote = f === "website"
      ? "Website enquiries arrive through the form and are usually answered by phone or email outside the CRM, so reply speed is only measured for chat channels."
      : "Not enough conversations yet to compare reply speed.";

    views[f] = {
      key: f, label: CHANNEL_LABEL[f], headline, ranks: ranks.slice(0, 3), kpis, weeks, channels: f === "all" ? channels : [f],
      courses, speed, speedNote, sources: sources.filter((s) => inFilter(s.channel, "all")), signals,
    };
  }

  return { filters, views, days: d.days };
}

function findCourseGap(d: MarketingStoryData, ch: ChannelKey) {
  const byCourse = new Map<string, Array<{ channel: ChannelKey; n: number; warm: number }>>();
  for (const r of d.courses) {
    if (!r.course) continue;
    const list = byCourse.get(r.course) ?? [];
    list.push({ channel: r.channel, n: Number(r.n), warm: Number(r.warm) });
    byCourse.set(r.course, list);
  }
  let best: { course: string; n: number; otherChannel: ChannelKey; otherRate: number } | null = null;
  for (const [course, list] of byCourse) {
    const mine = list.find((x) => x.channel === ch);
    const other = list.filter((x) => x.channel !== ch).sort((a, b) => b.n - a.n)[0];
    if (!mine || !other || mine.n < 10 || mine.warm > 0 || other.n < 30) continue;
    const rate = other.warm / other.n;
    if (rate < 0.08) continue;
    if (!best || mine.n > best.n) best = { course, n: mine.n, otherChannel: other.channel, otherRate: rate };
  }
  return best;
}

export function shortCourse(name: string): string {
  return name
    .replace(/Yoga Teacher Training/i, "YTT")
    .replace(/Teacher Training Course|Yoga TTC|TTC/i, "TTC")
    .replace(/Prenatal & Postnatal/i, "Prenatal")
    .replace(/(\d+)-Hour/i, "$1-Hr")
    .replace(/\s+/g, " ")
    .trim();
}

function monthName(m: string): string {
  return new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", timeZone: "UTC" });
}
