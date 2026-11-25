// Pure helpers for the "What makes people enrol" section of Personas.
// No server imports, so behaviour tests can load this file directly.

export type EnrolmentSignal = { key: string; label: string; n: number; payN: number; hiN: number };
export type EnrolmentAd = {
  adId: string; title: string | null; people: number; qualified: number; highIntent: number; payment: number;
  firstSeen: string | null; lastSeen: string | null;
};
export type EnrolmentIntelligence = {
  generatedAt: string;
  days: number;
  outcomes: { reachedPayment: number; wonOrEnrolled: number; paymentPendingNow: number; paymentRecords: number; paymentsPaid: number; enrollments: number };
  journey: { byChannel: Record<string, number>; movedBy: Record<string, number>; medianMessagesDm: number | null; websiteShareOfPeople: number | null };
  signals: EnrolmentSignal[];
  ads: EnrolmentAd[];
  layers: { people: number; conversation: number; ad: number; website: number; linkVisits: number; country: number; callsLogged: number; adSpendLastDay: string | null };
};

/** Below this many people with a signal, the rate is too noisy to show as a lift. */
export const MIN_SIGNAL_SAMPLE = 30;

export type RankedSignal = EnrolmentSignal & { rate: number; lift: number | null; reliable: boolean };

/** Rate of reaching payment for each signal, and how it compares with everyone. */
export function rankSignals(signals: EnrolmentSignal[]): { baseline: RankedSignal | null; ranked: RankedSignal[] } {
  const all = signals.find((s) => s.key === "all") ?? null;
  const baseRate = all && all.n > 0 ? all.payN / all.n : 0;
  const withRate = (s: EnrolmentSignal): RankedSignal => {
    const rate = s.n > 0 ? s.payN / s.n : 0;
    return { ...s, rate, lift: baseRate > 0 ? rate / baseRate : null, reliable: s.n >= MIN_SIGNAL_SAMPLE };
  };
  const ranked = signals.filter((s) => s.key !== "all").map(withRate)
    .sort((a, b) => Number(b.reliable) - Number(a.reliable) || b.rate - a.rate || b.n - a.n);
  return { baseline: all ? withRate(all) : null, ranked };
}

/** "Instagram post: ✨ Face Yoga Teacher Training..._Group_1" -> "✨ Face Yoga Teacher Training…" */
export function cleanAdTitle(title: string | null | undefined): string {
  const t = String(title ?? "")
    .replace(/^Instagram post:\s*/i, "")
    .replace(/_Group_\d+$/i, "")
    .replace(/\.\.\.$/, "…")
    .trim();
  return t || "Untitled ad";
}

/** Ads that share a title (Meta duplicates an ad per ad set) are one creative to the reader. */
export function groupAdsByCreative(ads: EnrolmentAd[]): Array<EnrolmentAd & { adIds: string[] }> {
  const byTitle = new Map<string, EnrolmentAd & { adIds: string[] }>();
  for (const ad of ads) {
    const key = cleanAdTitle(ad.title).toLowerCase();
    const cur = byTitle.get(key);
    if (!cur) { byTitle.set(key, { ...ad, title: cleanAdTitle(ad.title), adIds: [ad.adId] }); continue; }
    cur.people += ad.people; cur.qualified += ad.qualified; cur.highIntent += ad.highIntent; cur.payment += ad.payment;
    cur.adIds.push(ad.adId);
    if (ad.firstSeen && (!cur.firstSeen || ad.firstSeen < cur.firstSeen)) cur.firstSeen = ad.firstSeen;
    if (ad.lastSeen && (!cur.lastSeen || ad.lastSeen > cur.lastSeen)) cur.lastSeen = ad.lastSeen;
  }
  return [...byTitle.values()].sort((a, b) => b.people - a.people);
}

export type LayerStatus = "live" | "partial" | "gap" | "missing";
export type DataLayer = { key: string; name: string; what: string; coverage: number; count: string; status: LayerStatus; note: string };

const share = (n: number, of: number) => (of > 0 ? Math.min(1, n / of) : 0);

/** The 10 data layers, how much each covers and what to do about the gaps. */
export function dataLayers(i: EnrolmentIntelligence, today = new Date()): DataLayer[] {
  const L = i.layers; const o = i.outcomes;
  const paid = o.paymentsPaid + o.enrollments;
  const spendDay = L.adSpendLastDay ? new Date(L.adSpendLastDay) : null;
  const spendStale = !spendDay || today.getTime() - spendDay.getTime() > 3 * 86_400_000;
  const fmt = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  return [
    { key: "outcome", name: "Payments and enrolments", what: "The outcome the model learns to predict", coverage: share(o.wonOrEnrolled, Math.max(1, o.reachedPayment)), count: `${o.wonOrEnrolled} marked won or enrolled · ${paid} payments recorded as paid`, status: paid ? "partial" : "gap", note: paid ? "Keep marking who paid" : "Critical gap: mark who paid" },
    { key: "ad", name: "Ad they clicked", what: "Which ad started the chat", coverage: share(L.ad, L.people), count: `${L.ad.toLocaleString("en-IN")} people`, status: L.ad ? "live" : "missing", note: L.ad ? "Live · new" : "No ad clicks seen yet" },
    { key: "conversation", name: "Conversation", what: "Questions, topics, how many days they wrote", coverage: share(L.conversation, L.people), count: `${L.conversation.toLocaleString("en-IN")} people`, status: "live", note: "Live" },
    { key: "replies", name: "Our replies", what: "Did we reply, how fast, who replied", coverage: share(L.conversation, L.people), count: `${L.conversation.toLocaleString("en-IN")} people`, status: "live", note: "Live" },
    { key: "website", name: "Website behaviour", what: "Pages, price page, return visits", coverage: share(L.website, L.people), count: `${L.website.toLocaleString("en-IN")} people`, status: "partial", note: "Grows with course links" },
    { key: "links", name: "Course link opens", what: "Opened the link we sent in the chat", coverage: share(L.linkVisits, L.people), count: `${L.linkVisits} real opens`, status: L.linkVisits ? "live" : "partial", note: "Live · new" },
    { key: "country", name: "Country and market", what: "Where they are, which fee applies", coverage: share(L.country, L.people), count: `${L.country.toLocaleString("en-IN")} people`, status: "partial", note: "Asked in the first reply now" },
    { key: "calls", name: "Calls and WhatsApp outside the CRM", what: "Calls the team makes from their phones", coverage: share(L.callsLogged, L.people), count: `${L.callsLogged} calls logged`, status: "gap", note: "Log calls in one tap" },
    { key: "students", name: "Past students", what: "Who joined before the CRM existed", coverage: 0, count: "Not uploaded", status: "missing", note: "Upload a list" },
    { key: "spend", name: "Ad spend", what: "Cost per lead and per enrolment", coverage: spendStale ? 0 : 1, count: spendDay ? `Last synced ${fmt(spendDay)}` : "Never synced", status: spendStale ? "gap" : "live", note: spendStale ? "Reconnect Meta Ads" : "Live" },
  ];
}

export function pctText(x: number, digits = 0): string {
  return `${(x * 100).toFixed(digits)}%`;
}
