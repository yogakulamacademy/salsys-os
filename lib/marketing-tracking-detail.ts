// Marketing › Tracking check › "Connections and data" and "Forms and links"
// (owner-approved prototype "Tracking check inner pages", 26 Nov 2026). Pure
// helpers over marketing_tracking_detail_v1; the page-name helper is passed in.

import type { PageKpi, PageRank, PageSignal, Part } from "@/lib/marketing-pages";
import type { TrackingData } from "@/lib/marketing-web";

export type TrackingDetail = {
  base: TrackingData;
  days: Array<{ day: string; events: number; forms: number }>;
  sources: Array<{ name: string; type: string; status: string; lastAt: string | null; accepted: number; rejected: number }>;
  counts: { formSends: number; bookings: number; payments: number; lastBookingAt: string | null; leadsByChannel: Record<string, number> };
  forms: {
    sends: number; visits: number; missedVisits: number;
    byForm: Array<{ form: string; sends: number; missed: number }>;
    missedPages: Array<{ form: string; path: string; n: number }>;
    missedDays: Array<{ form: string; day: string; n: number }>;
    test: { path: string; sends: number } | null;
  };
  webLeadSources: Array<{ source: string; n: number }>;
  links: { made: number; sent: number; opened: number; opens: number; since: string | null };
};
export type ConnStatus = "ok" | "warn" | "bad" | "off";
export type ConnRow = { key: string; name: string; status: ConnStatus; last: string; volume: string; feeds: string };
export type ConnectionsStory = {
  headline: Part[]; ranks: PageRank[]; kpis: PageKpi[]; rows: ConnRow[];
  days: Array<{ label: string; events: number; forms: number; partial: boolean }>; gaps: number; signals: PageSignal[];
};
export type FormRow = { key: string; label: string; sends: number; missed: number; pages: Array<{ label: string; n: number }> };
export type FormsStory = {
  headline: Part[]; ranks: PageRank[]; kpis: PageKpi[]; forms: FormRow[];
  sources: Array<{ label: string; n: number; unknown: boolean }>; webLeads: number;
  links: TrackingDetail["links"]; signals: PageSignal[];
};

const n = (x: number) => Math.round(Number(x) || 0).toLocaleString("en-IN");
const H = 3_600_000, D = 24 * H;
const ist = (iso: string, o: Intl.DateTimeFormatOptions) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", ...o });
const dayKey = (t: number) => new Date(t).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
export const day = (iso: string) => ist(iso, { day: "numeric", month: "short" });

export function isTrackingDetail(v: unknown): v is TrackingDetail {
  const d = v as TrackingDetail | null;
  return Boolean(d && d.base && Array.isArray(d.days) && d.forms && Array.isArray(d.forms.byForm) && d.links);
}

function when(iso: string | null, now: number) {
  if (!iso) return "never";
  const t = Date.parse(iso);
  if (dayKey(t) === dayKey(now)) return `today, ${ist(iso, { hour: "numeric", minute: "2-digit", hour12: true }).replace(/\s?(am|pm)$/i, (m) => ` ${m.trim().toLowerCase()}`)}`;
  if (dayKey(t) === dayKey(now - D)) return "yesterday";
  return day(iso);
}
const age = (iso: string | null | undefined, now: number) => (iso ? now - Date.parse(iso) : Infinity);
const daysAgo = (iso: string, now: number) => Math.round((now - Date.parse(iso)) / D);

/* ---------------- Connections and data ---------------- */

export function buildConnectionsStory(d: TrackingDetail, now = Date.now()): ConnectionsStory {
  const b = d.base;
  const rows: ConnRow[] = [];
  const leads = d.counts.leadsByChannel ?? {};
  const live = d.sources.filter((s) => s.type === "website" && s.status === "active" && s.lastAt);
  for (const s of live) {
    rows.push({ key: `web-${s.name}`, name: `Website tracking (${s.name.replace(/^Website:\s*/i, "")})`,
      status: age(s.lastAt, now) < 3 * H ? "ok" : age(s.lastAt, now) < 2 * D ? "warn" : "bad", last: when(s.lastAt, now),
      volume: `${n(b.visits30d.all)} visits · ${n(d.counts.formSends)} form sends`, feeds: "Website pages, Clicks and forms, enquiry sources" });
  }
  if (!live.length) rows.push({ key: "web", name: "Website tracking", status: "bad", last: when(b.website.lastEventAt, now), volume: "nothing", feeds: "Website pages, Clicks and forms" });
  for (const s of d.sources.filter((x) => x.type !== "website" && x.status === "active")) {
    const bookingFeed = /website|backend|booking/i.test(s.name);
    rows.push({ key: `api-${s.name}`, name: bookingFeed ? "Website bookings and payments" : s.name,
      status: !s.lastAt ? "off" : age(s.lastAt, now) < 7 * D ? "ok" : "warn", last: when(s.lastAt, now),
      volume: bookingFeed ? `${n(d.counts.bookings)} bookings · ${n(d.counts.payments)} payments started` : `${n(s.accepted)} events`,
      feeds: bookingFeed ? "Booking → payment journey" : "Server events" });
  }
  if (b.lastInstagramAt || leads.instagram) rows.push({ key: "ig", name: "Instagram messages", status: age(b.lastInstagramAt, now) < 2 * D ? "ok" : age(b.lastInstagramAt, now) < 7 * D ? "warn" : "bad",
    last: when(b.lastInstagramAt, now), volume: `${n(leads.instagram ?? 0)} new enquiries`, feeds: "Inbox, enquiries from Instagram" });
  if (b.lastWhatsAppAt || leads.whatsapp) {
    const a = age(b.lastWhatsAppAt, now);
    rows.push({ key: "wa", name: "WhatsApp", status: a < 3 * D ? "ok" : a < 14 * D ? "warn" : "bad", last: when(b.lastWhatsAppAt, now),
      volume: `${n(leads.whatsapp ?? 0)} new enquiries`, feeds: a < 3 * D ? "Inbox" : `Inbox; quiet for ${Math.floor(a / D)} days, which can be normal` });
  }
  const sync = (key: string, name: string, r: { status: string; at: string; dataTo: string | null } | null, feeds: string, lag: string) => {
    if (!r) return;
    const okRun = /^(completed|success)$/i.test(r.status);
    rows.push({ key, name, status: okRun && age(r.at, now) < 2 * D ? "ok" : okRun ? "warn" : "bad", last: `${when(r.at, now)}${r.dataTo ? ` · data to ${day(r.dataTo)}` : ""}`, volume: lag, feeds });
  };
  sync("ga4", "Google Analytics", b.ga4, "Visits and sources", "daily");
  sync("gsc", "Search Console", b.gsc, "Google search pages", "daily (Google is 2–3 days behind)");
  const meta = b.meta;
  if (meta) {
    const ok = age(meta.lastSuccessAt, now) < 2 * D;
    rows.push({ key: "meta", name: "Meta Ads", status: ok ? "ok" : "bad", last: when(meta.lastSuccessAt, now), volume: ok ? "daily" : "nothing", feeds: "Ads page, cost per enquiry" });
  }
  const g = b.google;
  if (g) {
    const ok = age(g.lastSuccessAt, now) < 2 * D && !/fail|error/i.test(g.status);
    rows.push({ key: "google", name: "Google Ads", status: ok ? "ok" : "bad", last: ok ? when(g.lastSuccessAt, now) : `${when(g.lastSuccessAt, now)} · failing now`, volume: ok ? "daily" : "nothing", feeds: "Ads page" });
  }
  for (const s of d.sources.filter((x) => x.type === "website" && x.status === "active" && !x.lastAt)) {
    rows.push({ key: `old-${s.name}`, name: `Unused tracker (${s.name.replace(/^Website:\s*/i, "")})`, status: "off", last: "never", volume: "nothing", feeds: "Nothing; safe to switch off" });
  }

  const counted = rows.filter((r) => r.status !== "off");
  const working = counted.filter((r) => r.status === "ok" || r.status === "warn");
  const broken = counted.filter((r) => r.status === "bad");
  const unused = rows.filter((r) => r.key.startsWith("old-"));
  const okNames = counted.filter((r) => r.status === "ok").map((r) => r.name.replace(/\s*\(.*\)$/, "").replace(/^Website tracking$/, "the website").replace(/^Website bookings and payments$/, "bookings").replace(/ messages$/, ""));

  const headline: Part[] = [{ text: `${working.length} of ${counted.length} connections are working.`, strong: true }];
  const metaRow = rows.find((r) => r.key === "meta" && r.status === "bad");
  const googleRow = rows.find((r) => r.key === "google" && r.status === "bad");
  const notApproved = /NOT_APPROVED|only approved for use with test accounts/i.test(g?.error ?? "");
  const brokenText = [metaRow ? `Meta Ads hasn’t sent anything since ${meta?.lastSuccessAt ? day(meta.lastSuccessAt) : "it was connected"}` : "",
    googleRow ? (notApproved ? "Google Ads is blocked until Google approves your API access" : "Google Ads is failing") : "",
    ...broken.filter((r) => r.key !== "meta" && r.key !== "google").map((r) => `${r.name} has stopped`)].filter(Boolean);
  if (brokenText.length) headline.push({ text: ` ${brokenText.join(", and ")}.`, strong: true });
  if (okNames.length) headline.push({ text: ` ${okNames.length === 1 ? okNames[0][0].toUpperCase() + okNames[0].slice(1) + " is" : `${okNames.slice(0, -1).join(", ").replace(/^./, (c) => c.toUpperCase())} and ${okNames.at(-1)} are`} up to date.` });

  const ranks: PageRank[] = [];
  if (metaRow && meta?.lastSuccessAt) ranks.push({ id: "meta", impact: `Meta Ads · last data ${day(meta.lastSuccessAt)}`, title: "Reconnect Meta Ads",
    bars: [], body: [{ text: `No ad spend or results have arrived since ${day(meta.lastSuccessAt)}, ${daysAgo(meta.lastSuccessAt, now)} days ago. ` }, { text: "The Ads page and cost per enquiry show old numbers until it’s reconnected.", strong: true }],
    actions: [{ label: "Open Settings › Connections", href: "/settings/integrations", primary: true }], basis: "Meta Ads sync" });
  if (googleRow) ranks.push({ id: "google", impact: `Google Ads · failing${g?.lastSuccessAt ? ` since ${day(g.lastSuccessAt)}` : ""}`, title: notApproved ? "Get Google Ads approved" : "Fix the Google Ads connection",
    bars: [], body: notApproved
      ? [{ text: "Google says the app is only approved for test accounts, so your real campaigns can’t be read. " }, { text: "Once Google approves the API access, data starts the same day.", strong: true }]
      : [{ text: "The last Google Ads sync failed. " }, { text: "Reconnect it in Settings.", strong: true }],
    actions: [{ label: "Open Settings › Connections", href: "/settings/integrations", primary: !ranks.length }], basis: "Google Ads sync" });
  if (unused.length) ranks.push({ id: "unused", impact: "Never sent anything", title: `Turn off the unused website tracker${unused.length > 1 ? "s" : ""}`,
    bars: [], body: [{ text: `${unused.map((u) => u.name.replace(/^Unused tracker \((.*)\)$/, "$1")).join(" and ")} ${unused.length > 1 ? "have" : "has"} never sent data. ` }, { text: "Switching it off keeps the list clean; nothing depends on it.", strong: true }],
    actions: [{ label: "Open Setup", href: "/tracking/sources", primary: !ranks.length }], basis: "Tracking sources" });

  const ig = rows.find((r) => r.key === "ig");
  const kpis: PageKpi[] = [
    { label: "Connections working", value: `${working.length} of ${counted.length}`, sub: broken.length ? `${broken.length} need fixing` : "all good", badge: broken.length ? { text: `${broken.length} broken`, tone: "bad" } : undefined },
    { label: "Website visits", value: n(b.website.visits24h), sub: "last 24 hours" },
    { label: "Website data rejected", value: n(b.website.rejected), sub: `of ${n(b.website.events)} events received` },
    ig ? { label: "Instagram", value: ig.status === "ok" ? "Live" : "Quiet", sub: `last message ${ig.last}` } : { label: "Form sends", value: n(d.counts.formSends), sub: "last 30 days" },
  ];

  // Last 15 days, filling days with no data so gaps show.
  const map = new Map(d.days.map((x) => [x.day, x]));
  const days: ConnectionsStory["days"] = [];
  for (let i = 14; i >= 0; i -= 1) {
    const k = dayKey(now - i * D);
    const x = map.get(k);
    days.push({ label: String(Number(k.slice(8))), events: Number(x?.events ?? 0), forms: Number(x?.forms ?? 0), partial: i === 0 });
  }
  const gaps = days.filter((x) => !x.partial && x.events === 0).length;

  const signals: PageSignal[] = [];
  const full = days.filter((x) => !x.partial && x.events > 0).map((x) => x.events).sort((a, b2) => a - b2);
  const median = full.length ? full[Math.floor(full.length / 2)] : 0;
  const spike = days.filter((x) => !x.partial && median > 0 && x.events >= median * 2.5).sort((a, b2) => b2.events - a.events)[0];
  if (spike) signals.push({ id: "spike", tag: "Check", tone: "amber", title: `${spike.label} ${new Date(now).toLocaleDateString("en-IN", { month: "short", timeZone: "Asia/Kolkata" })} had ${Math.round(spike.events / median)} times the usual website data${spike.forms ? "" : ", with no form sends"}`,
    summary: `${n(spike.events)} events against about ${n(median)} on a normal day.`, detail: "Usually a bot or one person reloading pages. Nothing to fix unless it repeats." });
  signals.push(gaps
    ? { id: "gaps", tag: "Fix", tone: "red", title: `${gaps} ${gaps === 1 ? "day" : "days"} with no website data in the last 15`, summary: "The tracking code didn’t send anything on those days.", detail: "Check the code is still on every page (see Setup)." }
    : { id: "gaps", tag: "Noticed", tone: "teal", title: "Website data arrived every day for the last 15 days", summary: "No missing days.", detail: "If a day ever shows nothing, this page will say so first." });
  if (b.gsc?.dataTo) signals.push({ id: "gsc", tag: "Note", tone: "muted", title: "Search Console is always 2–3 days behind", summary: `Data to ${day(b.gsc.dataTo)}, updated ${when(b.gsc.at, now)}.`, detail: "That’s Google’s normal delay, not a fault." });
  return { headline, ranks, kpis, rows, days, gaps, signals };
}

/* ---------------- Forms and links ---------------- */

export function formLabel(id: string): string {
  const s = id.toLowerCase();
  const popup = /popup|modal/.test(s);
  if (/enrol|enroll/.test(s)) return popup ? "Enrol pop-up on course pages" : "Enrol form";
  if (/reserv|booking/.test(s)) return "Enrol page form";
  if (/contact/.test(s)) return "Contact form";
  if (/lead|enquir|inquir/.test(s)) return popup ? "Enquiry pop-up" : "Enquiry form";
  if (s === "unnamed") return "Unnamed form";
  return id.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[-_]/g, " ").replace(/\bfrm\b/i, "").trim().replace(/^./, (c) => c.toUpperCase());
}

function sourceGroup(src: string): { label: string; unknown: boolean } {
  const s = src.toLowerCase();
  if (/^(direct|unknown|\(direct\)|none)$/.test(s)) return { label: "Typed / unknown", unknown: true };
  if (/google/.test(s)) return { label: "Google search", unknown: false };
  if (/^ig$|instagram/.test(s)) return { label: "Instagram links", unknown: false };
  if (/facebook|^fb$/.test(s)) return { label: "Facebook", unknown: false };
  if (/chatgpt|openai|perplexity|gemini|copilot|claude/.test(s)) return { label: "AI assistants", unknown: false };
  if (/whatsapp/.test(s)) return { label: "WhatsApp", unknown: false };
  if (/bing|yahoo|duckduckgo/.test(s)) return { label: "Other search", unknown: false };
  return { label: "Other sites", unknown: false };
}

export function buildFormsStory(d: TrackingDetail, pageLabel: (p: string) => string): FormsStory {
  const f = d.forms;
  const became = Math.max(0, f.visits - f.missedVisits);
  const forms: FormRow[] = f.byForm.map((r) => ({ key: r.form, label: formLabel(r.form), sends: Number(r.sends), missed: Number(r.missed),
    pages: f.missedPages.filter((p) => p.form === r.form).map((p) => ({ label: pageLabel(p.path), n: Number(p.n) })) }));
  const worst = [...forms].filter((r) => r.sends >= 10 && r.missed / r.sends >= 0.15).sort((a, b) => b.missed / b.sends - a.missed / a.sends)[0];
  const worstDay = worst ? f.missedDays.filter((x) => x.form === worst.key).sort((a, b) => b.n - a.n)[0] : undefined;

  const grouped = new Map<string, { label: string; n: number; unknown: boolean }>();
  for (const s of d.webLeadSources) {
    const g = sourceGroup(s.source);
    const cur = grouped.get(g.label) ?? { ...g, n: 0 };
    cur.n += Number(s.n);
    grouped.set(g.label, cur);
  }
  const sources = [...grouped.values()].sort((a, b) => b.n - a.n);
  const webLeads = sources.reduce((t, s) => t + s.n, 0);
  const unknown = sources.find((s) => s.unknown)?.n ?? 0;
  const v = d.base.visits30d;
  const tagShare = v.all ? v.tagged / v.all : 0;

  const headline: Part[] = [{ text: f.visits
    ? `In the last 30 days a website form was sent in ${n(f.visits)} visits and ${n(became)} of them became enquiries.${f.missedVisits ? ` In ${n(f.missedVisits)}, no enquiry was created${worst ? `, and the ${worst.label.toLowerCase()} loses the most: ${worst.missed} of ${worst.sends} sends` : ""}.` : " Every one reached the CRM."}`
    : "No website forms were sent in the last 30 days.", strong: true }];
  if (webLeads && unknown / webLeads >= 0.35) headline.push({ text: ` ${unknown / webLeads >= 0.45 && unknown / webLeads <= 0.55 ? "Half" : `${Math.round((unknown / webLeads) * 100)}%`} of website enquiries can’t say where the person came from${tagShare < 0.05 ? ", because almost no shared links carry campaign tags" : ""}.` });

  const ranks: PageRank[] = [];
  if (worst) ranks.push({ id: "worst", impact: `${worst.label} · ${worst.missed} of ${worst.sends} lost`, title: `Check the ${worst.label.toLowerCase()}`,
    bars: [{ label: "Sends", value: worst.sends, shown: n(worst.sends), tone: "soft" }, { label: "No enquiry", value: worst.missed, shown: n(worst.missed), tone: "red" }],
    body: [{ text: `${worst.missed} of its ${worst.sends} sends in 30 days didn’t create an enquiry${worstDay && worstDay.n >= 2 ? `, ${worstDay.n} of them on ${day(worstDay.day)} alone` : ""}. ` }, { text: "Send a test from one of its pages and check it reaches the Inbox.", strong: true }],
    actions: [{ label: "See the pages", href: "#forms", primary: true }], basis: "Website form sends, last 30 days" });
  if (v.all >= 200 && tagShare < 0.05) ranks.push({ id: "tags", impact: webLeads ? `${n(unknown)} of ${n(webLeads)} website enquiries have no source` : "Few tagged visits", title: "Tag the links you share",
    bars: [{ label: "Visits", value: v.all, shown: n(v.all), tone: "soft" }, { label: "Tagged", value: v.tagged, shown: n(v.tagged), tone: "brand" }],
    body: [{ text: `Only ${n(v.tagged)} of ${n(v.all)} website visits came from a tagged link. ` }, { text: "Tagged links in your Instagram bio, stories and WhatsApp show which post brought each person.", strong: true }],
    actions: [{ label: "See where enquiries came from", href: "#sources", primary: !ranks.length }], basis: "Website visits, last 30 days" });
  if (f.test && f.test.sends >= 5) ranks.push({ id: "test", impact: `${n(f.test.sends)} test sends in 30 days`, title: "Remove the test page",
    bars: [], body: [{ text: `${f.test.path} took ${n(f.test.sends)} form sends this month. ` }, { text: "These pages are left out of the counts here, but they still show in Google and other reports.", strong: true }],
    actions: [], basis: "Website form sends" });

  const kpis: PageKpi[] = [
    { label: "Visits with a form sent", value: n(f.visits), sub: `${n(f.sends)} sends${f.test ? ", test page left out" : ""}` },
    { label: "Became enquiries", value: n(became), sub: f.visits ? `${Math.round((became / f.visits) * 100)} in 100 visits` : "—" },
    { label: "No enquiry created", value: n(f.missedVisits), sub: f.missedVisits ? "see the forms below" : "none lost", badge: f.missedVisits ? { text: "check", tone: "warn" } : undefined },
    { label: "Tagged visits", value: n(v.tagged), sub: `of ${n(v.all)} visits` },
  ];

  const signals: PageSignal[] = [];
  const igLeads = Number(d.counts.leadsByChannel?.instagram ?? 0);
  if (igLeads) signals.push({ id: "ig", tag: "Noticed", tone: "teal", title: "Instagram enquiries always keep their source", summary: `${n(igLeads)} Instagram enquiries in 30 days come in through messages, so their source is never lost.`, detail: "Only website enquiries can lose where they came from." });
  if (v.metaClickIds > v.tagged * 3 && v.metaClickIds >= 30) signals.push({ id: "fbclid", tag: "Check", tone: "amber", title: "Visits from Instagram and Facebook links carry a click code but no campaign tag",
    summary: `${n(v.metaClickIds)} visits had the code, ${n(v.tagged)} had a tag.`, detail: "The code tells you it came from Instagram or Facebook, not which post. A tag adds that." });
  if (d.links.made) signals.push({ id: "links", tag: "Note", tone: "muted", title: `Tracked links started on ${d.links.since ? day(d.links.since) : "recently"}`,
    summary: `${n(d.links.made)} made, ${n(d.links.sent)} sent, ${n(d.links.opened)} of those opened.`, detail: "Numbers become more useful after a few weeks of sending." });
  return { headline, ranks, kpis, forms, sources, webLeads, links: d.links, signals };
}
