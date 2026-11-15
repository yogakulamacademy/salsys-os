/**
 * Conservative, descriptive channel normalization for Home reporting only.
 * Original first_touch_source values remain unchanged in the CRM.
 * A source value alone cannot establish paid/organic attribution or causation.
 */
export type HomeSourceName =
  | "Instagram"
  | "Facebook"
  | "Google"
  | "WhatsApp"
  | "ChatGPT"
  | "Direct"
  | "Unknown"
  | "Other sources";

export type HomeSourceRow = {
  source: string;
  leads: number;
  qualified: number;
  conversionRate: number | null;
};

type QualificationSourceRow = {
  source: string;
  leads: number;
  qualified: number;
};

export type SourceSignal = {
  title: string;
  detail: string;
  href: string;
  actionLabel: string;
};

export function normalizeFirstTouchSource(raw: string | null | undefined): HomeSourceName {
  const source = String(raw ?? "").trim().toLowerCase();
  if (!source || source === "unknown" || source === "(not set)" || source === "not set") {
    return "Unknown";
  }
  if (["instagram", "ig", "instagram.com", "www.instagram.com", "m.instagram.com", "l.instagram.com", "ig.me"].includes(source)) {
    return "Instagram";
  }
  if (["facebook", "fb", "facebook.com", "m.facebook.com", "l.facebook.com", "www.facebook.com"].includes(source)) {
    return "Facebook";
  }
  if (["google", "google.com", "www.google.com", "com.google.android.googlequicksearchbox"].includes(source)) {
    return "Google";
  }
  if (["whatsapp", "wa.me", "api.whatsapp.com", "web.whatsapp.com"].includes(source)) {
    return "WhatsApp";
  }
  if (["chatgpt", "chatgpt.com", "chat.openai.com", "www.chatgpt.com"].includes(source)) {
    return "ChatGPT";
  }
  if (source === "direct" || source === "(direct)") {
    return "Direct";
  }
  return "Other sources";
}

/**
 * Cross-check historical qualification source rows with the canonical lead
 * cohort before showing source rates. The upstream RPC presently returns
 * up to 25 RAW sources; if that was truncated, this returns null rather
 * than treating missing source histories as zero qualification.
 */
export function reconcileHomeSourceQualification(
  cohortSources: HomeSourceRow[],
  rawQualificationSources: QualificationSourceRow[],
  cohortLeads: number,
  qualifiedTotal: number,
): HomeSourceRow[] | null {
  if (![cohortLeads, qualifiedTotal].every((n) => Number.isSafeInteger(n) && n >= 0) ||
      qualifiedTotal > cohortLeads) return null;

  const historical = new Map<HomeSourceName, { leads: number; qualified: number }>();
  let historicalCount = 0;
  let historicalQualified = 0;
  for (const row of rawQualificationSources) {
    if (!Number.isSafeInteger(row.leads) || row.leads < 0 ||
        !Number.isSafeInteger(row.qualified) || row.qualified < 0 ||
        row.qualified > row.leads) return null;
    const channel = normalizeFirstTouchSource(row.source);
    const existing = historical.get(channel) ?? { leads: 0, qualified: 0 };
    existing.leads += row.leads;
    existing.qualified += row.qualified;
    historical.set(channel, existing);
    historicalCount += row.leads;
    historicalQualified += row.qualified;
  }
  // Strict count conservation catches the raw-source top-N truncation.
  if (historicalCount !== cohortLeads || historicalQualified !== qualifiedTotal) return null;

  let observedCount = 0;
  const result: HomeSourceRow[] = [];
  const seen = new Set<string>();
  for (const row of cohortSources) {
    if (!Number.isSafeInteger(row.leads) || row.leads < 0 || seen.has(row.source)) return null;
    seen.add(row.source);
    const source = normalizeFirstTouchSource(row.source);
    const matching = historical.get(source) ?? { leads: 0, qualified: 0 };
    if (matching.leads !== row.leads) return null;
    observedCount += row.leads;
    result.push({
      source,
      leads: row.leads,
      qualified: matching.qualified,
      conversionRate: row.leads > 0
        ? Math.round((matching.qualified / row.leads) * 1000) / 10
        : null,
    });
  }
  return observedCount === cohortLeads ? result : null;
}

/**
 * Deterministic exception signals. They are diagnostic prompts, not
 * causal explanations and not predictive lead-quality scores.
 */
export function buildHomeSourceSignals(
  totalLeads: number | null,
  sources: HomeSourceRow[],
  qualificationTotal: number | null,
): SourceSignal[] {
  if (totalLeads == null || totalLeads < 30 || !Number.isSafeInteger(totalLeads)) return [];
  const signals: SourceSignal[] = [];
  const top = [...sources].sort((a, b) => b.leads - a.leads)[0];
  if (top && top.leads >= 30 && top.leads / totalLeads >= 0.75) {
    signals.push({
      title: "Acquisition is concentrated",
      detail: `${(top.leads / totalLeads * 100).toFixed(1)}% of leads came from ${top.source}. Review source dependence before changing spend or outreach.`,
      href: "/marketing",
      actionLabel: "Inspect acquisition",
    });
  }
  const unknown = sources.find((item) => item.source === "Unknown");
  if (unknown && unknown.leads >= 10 && unknown.leads / totalLeads >= 0.1) {
    signals.push({
      title: "Acquisition source coverage needs review",
      detail: `${unknown.leads} leads lack a recorded first-touch source in the selected period. Investigate tracking coverage rather than assigning a guessed source.`,
      href: "/marketing",
      actionLabel: "Review attribution",
    });
  }
  if (qualificationTotal != null && qualificationTotal >= 0 &&
      qualificationTotal <= totalLeads && qualificationTotal / totalLeads < 0.05 &&
      totalLeads >= 50) {
    signals.push({
      title: "Few qualification milestones are recorded",
      detail: `${qualificationTotal} of ${totalLeads} new leads reached a qualifying CRM stage by period end. Check qualification workflows and lead fit; this is not proof the leads were low quality.`,
      href: "/leads",
      actionLabel: "Review qualification",
    });
  }
  return signals.slice(0, 2);
}
