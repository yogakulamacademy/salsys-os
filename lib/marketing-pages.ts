// Marketing "Where enquiries come from" and "Ads" pages (owner-approved
// prototype "Marketing step 2", 25 Nov 2026). Pure helpers over
// marketing_sources_v1 and marketing_ads_v1. Every figure is counted from the
// business's own records or the synced ad accounts; nothing is estimated by AI.

import type { ChannelKey, Part } from "@/lib/marketing-story";

export type { Part };

const n = (x: number) => Math.round(x).toLocaleString("en-IN");
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const DAY = 86_400_000;

export type BarTone = "brand" | "soft" | "red" | "amber" | "green" | "teal" | "slate" | "blue";
export type PageBar = { label: string; value: number; shown: string; tone: BarTone };
export type PageRank = { id: string; impact: string; title: string; bars: PageBar[]; max?: number; body: Part[]; actions: Array<{ label: string; href: string; primary?: boolean }>; basis: string };
export type PageKpi = { label: string; value: string; sub: string; badge?: { text: string; tone: "good" | "bad" | "warn" } };
export type PageSignal = { id: string; tag: string; tone: "teal" | "red" | "amber" | "muted"; title: string; summary: string; detail: string; platforms?: Array<"meta" | "google"> };

/* ---------------- Where enquiries come from ---------------- */

export type SourcesData = {
  days: number;
  sources: Array<{ channel: ChannelKey; source: string; n: number; new: number; engaged: number; warm: number; enrolled: number; closed: number; untouched: number }>;
  untouched: { n: number; unowned: number; olderThan3Days: number; overdueTasks: number };
};

export type SourceRow = {
  key: string; label: string; channel: ChannelKey; n: number;
  new: number; engaged: number; warm: number; enrolled: number; closed: number; untouched: number;
  note: string; href: string;
};

export type SourcesStory = { days: number; headline: Part[]; ranks: PageRank[]; kpis: PageKpi[]; rows: SourceRow[]; total: number };

export function isSourcesData(v: unknown): v is SourcesData {
  const d = v as SourcesData | null;
  return Boolean(d && Array.isArray(d.sources) && d.untouched && typeof d.untouched.n === "number");
}

const CH: Record<ChannelKey, string> = { instagram: "Instagram", website: "Website", whatsapp: "WhatsApp", other: "Other" };
const isSearch = (label: string) => /Google search|Bing search/.test(label);
const isAi = (label: string) => /ChatGPT|Perplexity|Gemini/.test(label);

/** `label` names a raw first-touch source (marketing-story’s sourceLabel; passed in so this file stays import-free for tests). */
export function buildSourcesStory(d: SourcesData, label: (source: string, channel: ChannelKey) => string): SourcesStory {
  const map = new Map<string, SourceRow>();
  for (const s of d.sources) {
    const name = label(s.source, s.channel);
    const key = `${s.channel}|${name}`;
    const row = map.get(key) ?? { key, label: name, channel: s.channel, n: 0, new: 0, engaged: 0, warm: 0, enrolled: 0, closed: 0, untouched: 0, note: "", href: `/leads?creation_channel=${s.channel}&sort=created_desc` };
    row.n += Number(s.n); row.new += Number(s.new); row.engaged += Number(s.engaged); row.warm += Number(s.warm);
    row.enrolled += Number(s.enrolled); row.closed += Number(s.closed); row.untouched += Number(s.untouched);
    map.set(key, row);
  }
  const rows = [...map.values()].sort((a, b) => b.n - a.n);
  const total = sum(rows.map((r) => r.n));
  const warmAll = sum(rows.map((r) => r.warm + r.enrolled));
  const enrolledAll = sum(rows.map((r) => r.enrolled));
  const byChannel = (c: ChannelKey) => rows.filter((r) => r.channel === c);
  const chTotal = (c: ChannelKey) => sum(byChannel(c).map((r) => r.n));
  const top = (["instagram", "website", "whatsapp", "other"] as ChannelKey[]).filter((c) => chTotal(c) > 0).sort((a, b) => chTotal(b) - chTotal(a));
  const lead = top[0];

  for (const r of rows) {
    const share = pct(r.n, total);
    if (r.untouched) r.note = `${n(r.untouched)} of ${n(r.n)} have no message, call or note from the team yet.`;
    else if (r.engaged >= r.n * 0.5) r.note = `${n(r.engaged)} asked something and then went quiet at Engaged; a check-in after a few days of silence brings many back.`;
    else r.note = `${share}% of all enquiries · ${pct(r.warm + r.enrolled, r.n)}% reached Qualified or later.`;
  }

  const u = d.untouched;
  const untouchedRows = rows.filter((r) => r.untouched > 0);
  const untouchedChannel = untouchedRows.length && untouchedRows.every((r) => r.channel === untouchedRows[0].channel) ? untouchedRows[0].channel : null;
  // People someone did pick up, from the same channel as the untouched ones.
  const pickedRows = untouchedChannel ? byChannel(untouchedChannel) : rows;
  const picked = sum(pickedRows.map((r) => r.n - r.untouched));
  const pickedWarm = sum(pickedRows.map((r) => r.warm + r.enrolled));

  const ranks: PageRank[] = [];
  if (u.n >= 5) {
    const where = untouchedChannel ? `${CH[untouchedChannel].toLowerCase()} ` : "";
    ranks.push({
      id: "untouched",
      impact: picked >= 5 ? `${n(pickedWarm)} of ${n(picked)} picked up turned warm` : `${n(u.n)} untouched`,
      title: `Work the ${n(u.n)} ${where}enquiries still at New`,
      bars: [
        { label: `Picked up · ${n(picked)}`, value: picked ? pickedWarm / picked : 0, shown: `${pct(pickedWarm, picked)}% warm`, tone: "brand" },
        { label: `Never touched · ${n(u.n)}`, value: 0, shown: "no contact", tone: "red" },
      ],
      max: 1,
      body: [
        { text: `No message, call or note is recorded for any of the ${n(u.n)}` },
        { text: u.unowned ? `, ${n(u.unowned)} have no owner` : "", strong: true },
        { text: `${u.overdueTasks ? `, and ${n(u.overdueTasks)} follow-up tasks for them are overdue` : ""}. ` },
        { text: picked >= 5 ? `Of the ${n(picked)} ${where}enquiries someone did pick up, ${n(pickedWarm)} reached Qualified or later.` : "" },
      ],
      actions: [
        { label: "Assign them in Leads", href: `/leads?stage=new${untouchedChannel ? `&creation_channel=${untouchedChannel}` : ""}`, primary: true },
        { label: "Open overdue tasks", href: "/follow-ups" },
      ],
      basis: `Enquiries from the last ${d.days} days still at New`,
    });
  }

  const quiet = lead ? byChannel(lead).reduce((s, r) => s + r.engaged, 0) : 0;
  if (lead && quiet >= 20 && quiet >= chTotal(lead) * 0.4) {
    const leadWarm = sum(byChannel(lead).map((r) => r.warm + r.enrolled)), leadClosed = sum(byChannel(lead).map((r) => r.closed));
    ranks.push({
      id: "quiet",
      impact: `${n(quiet)} stuck at Engaged`,
      title: `Bring back the ${CH[lead]} people who asked once`,
      bars: [
        { label: "Engaged", value: quiet, shown: n(quiet), tone: "soft" },
        { label: "Qualified or later", value: leadWarm, shown: n(leadWarm), tone: "brand" },
        { label: "Not now / lost", value: leadClosed, shown: n(leadClosed), tone: "slate" },
      ],
      max: chTotal(lead),
      body: [{ text: `${pct(quiet, chTotal(lead))}% of ${CH[lead]} enquiries asked something (usually the fee) and went quiet. ` }, { text: "A check-in to them is the cheapest way to more warm people", strong: true }, { text: "; Re-engaged shows the ones who reply." }],
      actions: [{ label: "Open Re-engaged", href: "/re-engaged", primary: true }],
      basis: `${CH[lead]} enquiries from the last ${d.days} days, by stage now`,
    });
  }

  const searchRows = rows.filter((r) => isSearch(r.label) || isAi(r.label));
  const searchUntouched = sum(searchRows.map((r) => r.untouched));
  if (searchUntouched >= 3) {
    ranks.push({
      id: "search",
      impact: `${n(searchUntouched)} searchers untouched`,
      title: "Answer the people Google and AI assistants send",
      bars: searchRows.map((r) => ({ label: `${r.label.replace(/^Website · /, "")} · ${n(r.n)}`, value: r.n - r.untouched, shown: `${n(r.n - r.untouched)} picked up`, tone: "teal" as const })),
      max: Math.max(...searchRows.map((r) => r.n)),
      body: [{ text: "Search and AI visitors are actively looking for a course. " }, { text: searchRows.map((r) => `${n(r.untouched)} of ${n(r.n)} from ${r.label.replace(/^Website · /, "")}`).join(" and "), strong: true }, { text: " are still at New." }],
      actions: [{ label: "See them in Leads", href: "/leads?stage=new&creation_channel=website", primary: true }],
      basis: "Website enquiries by how they found you",
    });
  }

  const channelsText = top.slice(0, 2).map((c) => `${pct(chTotal(c), total)}% ${CH[c]}`).join(" · ");
  const headline: Part[] = [];
  if (lead) {
    const leadEnrolled = sum(byChannel(lead).map((r) => r.enrolled));
    headline.push({ text: `${CH[lead]} brings ${pct(chTotal(lead), total)}% of enquiries${enrolledAll ? ` and ${n(leadEnrolled)} of the ${n(enrolledAll)} enrolments` : ""}.`, strong: true });
  }
  if (u.n >= 5) {
    const ch = untouchedChannel ? CH[untouchedChannel] : "";
    headline.push({ text: ` ${ch ? `${ch} enquiries are being left alone: ` : ""}${n(u.n)} of ${n(untouchedChannel ? chTotal(untouchedChannel) : total)} from the last ${d.days} days are still at New, with no message or call recorded.`, strong: true });
    if (picked >= 5) headline.push({ text: ` The ${n(picked)} that someone did pick up mostly turned warm (${n(pickedWarm)} of ${n(picked)}).` });
  }

  const kpis: PageKpi[] = [
    { label: `Enquiries · ${d.days} days`, value: n(total), sub: channelsText },
    { label: "Still at New, untouched", value: n(u.n), sub: u.n ? `${n(u.olderThan3Days)} older than 3 days · ${n(u.unowned)} with no owner` : "Every enquiry has been picked up", badge: u.n ? { text: `${n(u.n)} untouched`, tone: "bad" } : undefined },
    { label: "Qualified or later", value: `${pct(warmAll, total)}%`, sub: `${n(warmAll)} of ${n(total)}, enrolled included` },
    { label: "Enrolled", value: n(enrolledAll), sub: top.filter((c) => sum(byChannel(c).map((r) => r.enrolled)) > 0).map((c) => `${n(sum(byChannel(c).map((r) => r.enrolled)))} from ${CH[c]}`).join(" · ") || "None yet" },
  ];

  return { days: d.days, headline, ranks: ranks.slice(0, 3), kpis, rows, total };
}

/* ---------------- Ads ---------------- */

export type Platform = "meta" | "google";
export type AdsData = {
  campaigns: Array<{ platform: Platform; name: string; firstDay: string; lastDay: string; spend: number; clicks: number; conversions: number | null; currency: string | null }>;
  weeks: Array<{ week: string; platform: Platform; spend: number }>;
  sync: Partial<Record<Platform, { status: string | null; at: string | null; lastSuccessAt: string | null; dataTo: string | null; error: string | null } | null>>;
  enquiries: { n: number; withCampaign: number };
};

export type AdsCampaign = AdsData["campaigns"][number] & { label: string; cpc: number | null };
export type AdsWeek = { week: string; label: string; meta: number | null; google: number | null; blind: boolean };
export type AdsView = { key: "all" | Platform; headline: Part[]; ranks: PageRank[]; kpis: PageKpi[]; signals: PageSignal[] };
export type AdsStory = { views: Record<string, AdsView>; filters: Array<"all" | Platform>; campaigns: AdsCampaign[]; weeks: AdsWeek[]; blindFrom: string | null; connected: boolean; tagged: boolean; enquiries?: { n: number; withCampaign: number } };

export function isAdsData(v: unknown): v is AdsData {
  const d = v as AdsData | null;
  return Boolean(d && Array.isArray(d.campaigns) && Array.isArray(d.weeks) && d.sync && d.enquiries);
}

const day = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
const inr = (x: number) => `₹${n(x)}`;
const PLATFORM: Record<Platform, string> = { meta: "Meta", google: "Google" };

/** Campaign names from boosted Instagram posts read better as "Boosted post: …". */
export function campaignLabel(name: string): string {
  return name.replace(/^Instagram post:\s*/i, "Boosted post: ").replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]️?\s*/gu, "").replace(/\s+/g, " ").trim();
}

/** Plain explanation of a Google Ads sync error. */
export function googleErrorText(error: string | null): string | null {
  if (!error) return null;
  if (/CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION/i.test(error)) return "Google hasn’t yet approved SalsysOS’s Google Ads API access for live ad accounts (the access request is still pending).";
  if (/PERMISSION_DENIED|does not have permission/i.test(error)) return "Google refuses access to the ad account: the account may have been disconnected, or the signed-in user lost access.";
  if (/invalid_grant|UNAUTHENTICATED|expired/i.test(error)) return "The Google sign-in has expired; reconnect Google Ads in Integrations.";
  return "Google returned an error when the CRM tried to read the ad account.";
}

export function buildAdsStory(d: AdsData, now = new Date()): AdsStory {
  const campaigns: AdsCampaign[] = d.campaigns.map((c) => ({ ...c, spend: Number(c.spend), clicks: Number(c.clicks), label: campaignLabel(c.name), cpc: Number(c.clicks) > 0 ? Number(c.spend) / Number(c.clicks) : null }));
  const platforms = (["meta", "google"] as Platform[]).filter((p) => d.sync[p] || campaigns.some((c) => c.platform === p));
  const stale = (at: string | null | undefined) => !at || now.getTime() - Date.parse(at) > 3 * DAY;
  const state = (p: Platform) => {
    const s = d.sync[p];
    if (!s) return { known: false, bad: false, failing: false, stopped: false, lastOk: null as string | null, dataTo: null as string | null, error: null as string | null };
    const failing = s.status === "failed";
    const stopped = !failing && stale(s.at);
    return { known: true, bad: failing || stopped || stale(s.lastSuccessAt), failing, stopped, lastOk: s.lastSuccessAt, dataTo: s.dataTo, error: s.error };
  };
  const st = { meta: state("meta"), google: state("google") };
  const connected = platforms.some((p) => st[p].known);

  // Weekly spend from the first synced week, through the current week; weeks after the
  // last synced day are "blind": the CRM can't see whether anything was spent.
  const lastData = platforms.map((p) => st[p].dataTo).filter(Boolean).sort().pop() ?? null;
  const firstWeek = d.weeks[0]?.week ?? null;
  const weeks: AdsWeek[] = [];
  if (firstWeek) {
    const end = now.getTime();
    for (let t = Date.parse(`${firstWeek}T00:00:00Z`), i = 0; t <= end && i < 30; t += 7 * DAY, i++) {
      const wk = new Date(t).toISOString().slice(0, 10);
      const rows = d.weeks.filter((w) => w.week === wk);
      const blind = Boolean(lastData) && wk > lastData!;
      const v = (p: Platform) => blind ? null : sum(rows.filter((r) => r.platform === p).map((r) => Number(r.spend)));
      weeks.push({ week: wk, label: day(wk), meta: v("meta"), google: v("google"), blind });
    }
  }
  const blindFrom = weeks.find((w) => w.blind)?.week ?? null;

  const views: Record<string, AdsView> = {};
  const filters: Array<"all" | Platform> = ["all", ...platforms.filter((p) => campaigns.some((c) => c.platform === p))];
  for (const f of filters) {
    const C = campaigns.filter((c) => f === "all" || c.platform === f);
    const spend = sum(C.map((c) => c.spend)), clicks = sum(C.map((c) => c.clicks));
    const firstDay = C.map((c) => c.firstDay).sort()[0], lastDay = C.map((c) => c.lastDay).sort().pop();
    const ps = f === "all" ? platforms : [f];
    const ranks: PageRank[] = [];
    if (ps.includes("google") && st.google.bad) {
      const why = googleErrorText(st.google.error);
      ranks.push({
        id: "google", impact: st.google.failing ? `Failing every day since ${st.google.lastOk ? day(st.google.lastOk) : "it was connected"}` : `No sync since ${st.google.lastOk ? day(st.google.lastOk) : "—"}`,
        title: "Fix the Google Ads connection",
        bars: [
          { label: "Last good sync", value: 1, shown: st.google.lastOk ? day(st.google.lastOk) : "never", tone: "green" },
          { label: "Daily sync", value: 1, shown: st.google.failing ? "refused" : "not running", tone: "red" },
        ],
        body: [{ text: why ? `${why} ` : "The daily sync isn’t running. ", strong: Boolean(why) }, { text: "Once it works again, spend and clicks fill in from where they stopped." }],
        actions: [{ label: "Open Integrations", href: "/settings/integrations", primary: true }],
        basis: "Google Ads sync runs",
      });
    }
    if (ps.includes("meta") && st.meta.bad) {
      ranks.push({
        id: "meta", impact: st.meta.failing ? `Failing since ${st.meta.lastOk ? day(st.meta.lastOk) : "—"}` : `No sync since ${st.meta.lastOk ? day(st.meta.lastOk) : "—"}`,
        title: "Reconnect Meta Ads",
        bars: [
          { label: "Last good sync", value: 1, shown: st.meta.lastOk ? day(st.meta.lastOk) : "never", tone: "green" },
          { label: "Since then", value: st.meta.failing ? 1 : 0, shown: st.meta.failing ? "failing" : "not running", tone: "amber" },
        ],
        body: [{ text: st.meta.failing ? "Meta’s daily sync is failing. " : `Meta’s last sync worked; it simply stopped running after ${st.meta.lastOk ? day(st.meta.lastOk) : "it was connected"}. ` }, { text: "Reconnecting restarts the daily sync and shows whether any ads have run since." }],
        actions: [{ label: "Open Integrations", href: "/settings/integrations", primary: true }],
        basis: "Meta Ads sync runs",
      });
    }
    if (d.enquiries.n >= 20 && d.enquiries.withCampaign <= d.enquiries.n * 0.02) {
      ranks.push({
        id: "tagging", impact: `${n(d.enquiries.withCampaign)} of ${n(d.enquiries.n)} enquiries tagged`,
        title: "Tag every ad so enquiries show where they came from",
        bars: [
          { label: "Enquiries with a campaign", value: d.enquiries.withCampaign, shown: n(d.enquiries.withCampaign), tone: "brand" },
          { label: "Without", value: d.enquiries.n - d.enquiries.withCampaign, shown: n(d.enquiries.n - d.enquiries.withCampaign), tone: "soft" },
        ],
        max: d.enquiries.n,
        body: [{ text: "Ad links and Instagram messages from ads don’t carry a campaign name, so even with spend synced " }, { text: "no enquiry can be matched to an ad", strong: true }, { text: ". Add UTM tags to every ad link, and use “Send message” ads so Instagram passes the ad along with the chat." }],
        actions: [{ label: "Check tracking", href: "/tracking", primary: true }],
        basis: "Campaign on enquiries from the last 30 days",
      });
    }

    const signals: PageSignal[] = [];
    const withClicks = C.filter((c) => c.clicks >= 20 && c.cpc !== null);
    const search = withClicks.filter((c) => c.platform === "google").sort((a, b) => b.spend - a.spend)[0];
    const bestMeta = withClicks.filter((c) => c.platform === "meta" && /boosted post/i.test(c.label)).sort((a, b) => a.cpc! - b.cpc!)[0];
    if (search && bestMeta && search.cpc! >= bestMeta.cpc! * 3) {
      signals.push({ id: "pricey", tag: "Pricey", tone: "red", platforms: ["google", "meta"],
        title: `Google search clicks cost ${Math.round(search.cpc! / bestMeta.cpc!)}× more than Instagram`,
        summary: `“${search.label}” paid ${inr(search.cpc!)} per click; “${bestMeta.label}” got clicks for ${inr(bestMeta.cpc!)}.`,
        detail: `${search.conversions === 0 ? `Google recorded 0 conversions on ${inr(search.spend)}, so conversion tracking isn’t set up. ` : ""}Before restarting Google search, set up conversion tracking and limit it to the searches most likely to enrol.` });
    }
    const lastWeek = [...weeks].reverse().find((w) => !w.blind);
    const lastSpend = lastWeek ? (f === "all" ? (lastWeek.meta ?? 0) + (lastWeek.google ?? 0) : (lastWeek[f] ?? 0)) : null;
    if (blindFrom && lastWeek && lastSpend !== null && lastSpend < 500) {
      signals.push({ id: "blind", tag: "Blind", tone: "amber",
        title: "Spend had nearly stopped before the sync died",
        summary: `The last week the CRM could see (from ${lastWeek.label}) shows ${inr(lastSpend)} of spend.`,
        detail: "So a later drop in enquiries probably isn’t because ads were switched off then; they were already off. Reconnecting will confirm it." });
    }
    const leadForm = C.find((c) => c.platform === "meta" && /lead/i.test(c.name) && c.spend >= 5000);
    if (leadForm) {
      signals.push({ id: "leadform", tag: "Unknown", tone: "amber", platforms: ["meta"],
        title: "A lead-form campaign’s results can’t be checked here",
        summary: `${inr(leadForm.spend)} went on “${leadForm.label}” (${day(leadForm.firstDay)} – ${day(leadForm.lastDay)}), and its leads aren’t linked to any enquiry in the CRM.`,
        detail: "If you run lead-form ads again, connect Meta lead forms first so every lead lands in the CRM, or send ads to the website or Instagram messages instead." });
    }
    const cheapest = withClicks.filter((c) => c.platform === "meta").sort((a, b) => a.cpc! - b.cpc!)[0];
    if (cheapest && cheapest.cpc! < 10) {
      signals.push({ id: "best", tag: "Best", tone: "teal", platforms: ["meta"],
        title: `“${cheapest.label}” got the cheapest clicks`,
        summary: `${inr(cheapest.spend)} bought ${n(cheapest.clicks)} clicks (${inr(cheapest.cpc!)} each).`,
        detail: "When ads restart, start from what got the cheapest clicks and match it with the courses that bring the warmest enquiries (see the Overview)." });
    }

    const headline: Part[] = spend > 0
      ? [
          { text: `${inr(spend)} was spent on ${f === "all" ? "ads" : `${PLATFORM[f]} ads`} between ${day(firstDay!)} and ${day(lastDay!)}${f === "all" && platforms.length > 1 ? ` (${platforms.map((p) => `${PLATFORM[p]} ${inr(sum(campaigns.filter((c) => c.platform === p).map((c) => c.spend)))}`).join(", ")})` : ""}${d.enquiries.withCampaign === 0 ? ", and none of it can be traced to an enquiry" : ""}.`, strong: true },
          { text: blindFrom ? ` Since ${day(lastData!)} the CRM can’t see the ad ${f === "all" ? "accounts" : "account"}, so it can’t tell whether ads are running now.` : "" },
        ]
      : [{ text: connected ? "No ad spend has synced yet." : "No ad account is connected yet.", strong: true }, { text: " Connect Meta and Google Ads in Integrations to see spend, clicks and cost per enquiry here." }];

    const cheap = withClicks.sort((a, b) => a.cpc! - b.cpc!)[0];
    const kpis: PageKpi[] = [
      { label: firstDay ? `Spent since ${day(firstDay)}` : "Spent", value: inr(spend), sub: f === "all" && platforms.length > 1 ? platforms.map((p) => `${PLATFORM[p]} ${inr(sum(campaigns.filter((c) => c.platform === p).map((c) => c.spend)))}`).join(" · ") : `${n(C.length)} campaigns` },
      { label: "Clicks to the website", value: n(clicks), sub: clicks ? `${inr(spend / clicks)} per click on average` : "No clicks recorded" },
      { label: "Cheapest clicks", value: cheap ? inr(cheap.cpc!) : "—", sub: cheap ? cheap.label : "Needs 20+ clicks" },
      { label: "Last spend the CRM saw", value: lastSpend === null ? "—" : inr(lastSpend), sub: lastWeek ? `Week of ${lastWeek.label}${blindFrom ? " · nothing visible since" : ""}` : "No data", badge: blindFrom && lastData ? { text: `blind since ${day(lastData)}`, tone: "warn" } : undefined },
    ];

    views[f] = { key: f, headline, ranks: ranks.slice(0, 3), kpis, signals: signals.filter((s) => f === "all" || !s.platforms || s.platforms.includes(f)) };
  }

  return { views, filters, campaigns, weeks, blindFrom, connected, tagged: d.enquiries.withCampaign > 0, enquiries: { n: Number(d.enquiries.n), withCampaign: Number(d.enquiries.withCampaign) } };
}
