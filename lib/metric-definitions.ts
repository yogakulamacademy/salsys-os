export type MetricDeltaDirection =
  | "higher_is_better"
  | "lower_is_better"
  | "neutral";

export type MetricStatusTone = "neutral" | "positive" | "warning" | "critical";

export type MetricDefinition = {
  definition: string;
  evidenceLabel: string;
  deltaDirection?: MetricDeltaDirection;
};

export type MetricStatus = {
  tone: MetricStatusTone;
  statusLabel: string;
};

const definitions: Record<string, MetricDefinition> = {
  "assigned leads": {
    definition: "Leads currently assigned to the signed-in admissions user, regardless of whether the opportunity is still active.",
    evidenceLabel: "CRM ownership",
    deltaDirection: "neutral",
  },
  "due today": {
    definition: "Open or snoozed follow-up tasks assigned to the user with a due time later today.",
    evidenceLabel: "Task schedule",
    deltaDirection: "lower_is_better",
  },
  "high intent": {
    definition: "Assigned leads currently recorded in the high-intent pipeline stage. Stage is an observed CRM state, not a predicted probability.",
    evidenceLabel: "Pipeline stage",
    deltaDirection: "neutral",
  },
  "my conversion": {
    definition: "Share of the user’s assigned leads currently recorded as enrolled. It is a descriptive CRM outcome ratio for the visible assignment set.",
    evidenceLabel: "Assigned CRM outcomes",
    deltaDirection: "higher_is_better",
  },
  "monitored systems": {
    definition: "Operational integrations and processing systems currently included in the system-health monitor.",
    evidenceLabel: "System health",
    deltaDirection: "neutral",
  },
  healthy: {
    definition: "Monitored systems currently operating within their configured health thresholds.",
    evidenceLabel: "System health",
    deltaDirection: "higher_is_better",
  },
  warnings: {
    definition: "Monitored systems that need review but are not currently classified as critical.",
    evidenceLabel: "System health",
    deltaDirection: "lower_is_better",
  },
  critical: {
    definition: "Monitored systems with a critical state such as a stuck event or failed latest run according to the health rules.",
    evidenceLabel: "System health",
    deltaDirection: "lower_is_better",
  },
  "events · 24h": {
    definition: "First-party tracking events received during the latest 24-hour window.",
    evidenceLabel: "Tracking evidence",
    deltaDirection: "neutral",
  },
  "visitors · 24h": {
    definition: "Anonymous first-party visitor identities observed during the latest 24-hour window.",
    evidenceLabel: "Tracking evidence",
    deltaDirection: "neutral",
  },
  "identified events": {
    definition: "Share of recent tracking events already linked to known CRM leads through the available identity evidence.",
    evidenceLabel: "Identity linkage",
    deltaDirection: "higher_is_better",
  },
  "ad click ids · 7d": {
    definition: "Tracking events in the latest seven-day window carrying supported advertising click identifiers such as Google or Meta IDs.",
    evidenceLabel: "Paid-media lineage",
    deltaDirection: "neutral",
  },
  "website enquiries · 24h": {
    definition: "Website enquiry submissions received through the CRM capture path during the latest 24-hour window.",
    evidenceLabel: "Lead capture",
    deltaDirection: "neutral",
  },
  "form starts · 7d": {
    definition: "Tracked browser form-start events observed during the latest seven-day window.",
    evidenceLabel: "Browser journey",
    deltaDirection: "neutral",
  },
  "contact cta clicks · 7d": {
    definition: "Tracked clicks on supported contact or booking calls-to-action during the latest seven-day window.",
    evidenceLabel: "Browser journey",
    deltaDirection: "neutral",
  },
  "website visitors · 7d": {
    definition: "Anonymous first-party visitors observed across tracked website activity during the latest seven-day window.",
    evidenceLabel: "Browser journey",
    deltaDirection: "neutral",
  },
  "knowledge items": {
    definition: "Knowledge documents currently visible in the workspace across active, review and archived states.",
    evidenceLabel: "Knowledge base",
    deltaDirection: "neutral",
  },
  approved: {
    definition: "Knowledge documents approved for use by the configured AI retrieval workflow.",
    evidenceLabel: "Knowledge base",
    deltaDirection: "neutral",
  },
  "draft / review": {
    definition: "Knowledge documents not yet approved for AI retrieval and still in draft or review state.",
    evidenceLabel: "Knowledge base",
    deltaDirection: "neutral",
  },
  archived: {
    definition: "Knowledge documents intentionally excluded from active retrieval because they are archived.",
    evidenceLabel: "Knowledge base",
    deltaDirection: "neutral",
  },
  "crm environment": {
    definition: "Current CRM data mode for this deployment, such as live Supabase-backed operation, mock data or incomplete setup.",
    evidenceLabel: "Configuration",
    deltaDirection: "neutral",
  },
  "forecast stages": {
    definition: "Pipeline stages currently configured with deterministic planning weights for revenue forecasting. Stage weights are not calibrated win probabilities.",
    evidenceLabel: "Forecast configuration",
    deltaDirection: "neutral",
  },
};

export function resolveMetricDefinition(label: string): MetricDefinition | null {
  return definitions[normalize(label)] ?? null;
}

export function resolveMetricStatus(label: string, value: string): MetricStatus | null {
  const key = normalize(label);
  const numeric = parseMetricNumber(value);

  if (key === "warnings" && numeric != null) {
    return numeric > 0
      ? { tone: "warning", statusLabel: "Review" }
      : { tone: "positive", statusLabel: "Clear" };
  }

  if (key === "critical" && numeric != null) {
    return numeric > 0
      ? { tone: "critical", statusLabel: "Action" }
      : { tone: "positive", statusLabel: "Clear" };
  }

  if (key === "crm environment") {
    const state = value.trim().toLowerCase();
    if (state === "live") return { tone: "positive", statusLabel: "Connected" };
    if (state === "mock") return { tone: "warning", statusLabel: "Mock data" };
    if (state === "setup") return { tone: "warning", statusLabel: "Setup needed" };
  }

  return null;
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function parseMetricNumber(value: string) {
  const cleaned = value.replace(/[^0-9.-]/g, "");
  if (!cleaned) return null;
  const numeric = Number(cleaned);
  return Number.isFinite(numeric) ? numeric : null;
}
