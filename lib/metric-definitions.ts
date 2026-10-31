export type MetricDeltaDirection =
  | "higher_is_better"
  | "lower_is_better"
  | "neutral";

export type MetricStatusTone = "neutral" | "positive" | "warning" | "critical";

export type MetricDefinition = {
  definition: string;
  evidenceLabel: string;
  deltaDirection?: MetricDeltaDirection;
  href?: string;
};

export type MetricStatus = {
  tone: MetricStatusTone;
  statusLabel: string;
};

const definitions: Record<string, MetricDefinition> = {
  leads: {
    definition:
      "CRM leads in the visible reporting scope. Lead-volume movement is descriptive and is not automatically a quality signal.",
    evidenceLabel: "CRM lead evidence",
    deltaDirection: "neutral",
    href: "/leads",
  },
  "qualified rate": {
    definition:
      "Share of visible leads currently recorded at the qualified stage. This is a CRM stage ratio, not a predicted conversion probability.",
    evidenceLabel: "CRM stage quality",
    deltaDirection: "higher_is_better",
    href: "/admissions",
  },
  enrollments: {
    definition:
      "Leads or enrollment records currently recorded as enrolled in the visible reporting scope.",
    evidenceLabel: "Recorded outcomes",
    deltaDirection: "higher_is_better",
    href: "/admissions",
  },
  collected: {
    definition:
      "Net collected revenue backed by recorded payment evidence. Original currencies remain separate unless an explicit FX display layer is used.",
    evidenceLabel: "Payment evidence",
    deltaDirection: "higher_is_better",
    href: "/revenue",
  },
  "needs reply": {
    definition:
      "Active conversations whose latest recorded state requires a human response. This is an action signal, not inferred customer intent.",
    evidenceLabel: "Conversation state",
    deltaDirection: "lower_is_better",
    href: "/conversations",
  },
  "overdue follow-ups": {
    definition:
      "Open follow-up tasks whose recorded due time has already passed.",
    evidenceLabel: "Task schedule",
    deltaDirection: "lower_is_better",
    href: "/follow-ups",
  },
  "payment pending": {
    definition:
      "Opportunities currently recorded in the payment-pending pipeline stage. Stage alone does not guarantee enrollment.",
    evidenceLabel: "Pipeline stage",
    deltaDirection: "neutral",
    href: "/admissions?view=payments",
  },
  "new leads": {
    definition:
      "Leads currently recorded in the New stage. Intake volume is descriptive and is not treated as quality by itself.",
    evidenceLabel: "CRM intake state",
    deltaDirection: "neutral",
    href: "/admissions?view=queue",
  },
  "assigned leads": {
    definition:
      "Leads currently assigned to the signed-in admissions user, regardless of whether the opportunity is still active.",
    evidenceLabel: "CRM ownership",
    deltaDirection: "neutral",
    href: "/leads",
  },
  "due today": {
    definition:
      "Open or snoozed follow-up tasks assigned to the user with a due time later today.",
    evidenceLabel: "Task schedule",
    deltaDirection: "lower_is_better",
    href: "/follow-ups",
  },
  "high intent": {
    definition:
      "Assigned leads currently recorded in the high-intent pipeline stage. Stage is an observed CRM state, not a predicted probability.",
    evidenceLabel: "Pipeline stage",
    deltaDirection: "neutral",
    href: "/pipeline",
  },
  "my conversion": {
    definition:
      "Share of the user’s assigned leads currently recorded as enrolled. It is a descriptive CRM outcome ratio for the visible assignment set.",
    evidenceLabel: "Assigned CRM outcomes",
    deltaDirection: "higher_is_better",
    href: "/pipeline",
  },
  "contact coverage": {
    definition:
      "Share of visible leads with at least one structured contact record. Historical imports may be incomplete.",
    evidenceLabel: "Structured contact logs",
    deltaDirection: "higher_is_better",
    href: "/performance?view=response",
  },
  "median first response": {
    definition:
      "Median elapsed time to the first recorded outbound contact where the required timestamps are available.",
    evidenceLabel: "Observed response evidence",
    deltaDirection: "lower_is_better",
    href: "/performance?view=response",
  },
  "median inbound response": {
    definition:
      "Median recorded response time following inbound contact. Missing historical events remain unknown.",
    evidenceLabel: "Observed response evidence",
    deltaDirection: "lower_is_better",
    href: "/performance?view=response",
  },
  "never contacted": {
    definition:
      "Visible leads with no structured contact event in available CRM evidence. This does not prove no contact occurred outside the system.",
    evidenceLabel: "Coverage gap",
    deltaDirection: "lower_is_better",
    href: "/performance?view=response",
  },
  "inbound contacts": {
    definition:
      "Structured contact events recorded as inbound. Volume is descriptive and is not a performance score.",
    evidenceLabel: "Communication activity",
    deltaDirection: "neutral",
    href: "/performance?view=communication",
  },
  "outbound contacts": {
    definition:
      "Structured contact events recorded as outbound. Higher activity volume is not automatically better.",
    evidenceLabel: "Communication activity",
    deltaDirection: "neutral",
    href: "/performance?view=communication",
  },
  "total contacts": {
    definition:
      "Total available structured inbound and outbound contact events in the current performance scope.",
    evidenceLabel: "Communication activity",
    deltaDirection: "neutral",
    href: "/performance?view=communication",
  },
  "marked successful": {
    definition:
      "Share of structured contact events explicitly marked successful in the CRM. It must not be interpreted as lead or sales conversion.",
    evidenceLabel: "Contact outcome label",
    deltaDirection: "neutral",
    href: "/performance?view=communication",
  },
  "active programs": {
    definition: "Programs currently marked active in the course catalog.",
    evidenceLabel: "Catalog state",
    deltaDirection: "neutral",
    href: "/course-management",
  },
  "upcoming batches": {
    definition:
      "Upcoming scheduled batches visible in the current operations workspace.",
    evidenceLabel: "Batch schedule",
    deltaDirection: "neutral",
    href: "/operations",
  },
  "confirmed enrolled": {
    definition:
      "Confirmed or completed enrollment records, with the documented legacy enrolled-stage fallback where required.",
    evidenceLabel: "Enrollment truth",
    deltaDirection: "higher_is_better",
    href: "/enrollments",
  },
  "calculated open": {
    definition:
      "Calculated remaining seats after subtracting confirmed enrollments from recorded batch capacity.",
    evidenceLabel: "Capacity calculation",
    deltaDirection: "neutral",
    href: "/availability",
  },
  "enrollment closed": {
    definition:
      "Upcoming batches whose enrollment state is currently closed.",
    evidenceLabel: "Batch state",
    deltaDirection: "neutral",
    href: "/course-management",
  },
  "demand pressure": {
    definition:
      "Operational warning when active prospects or payment-pending demand approaches or exceeds known open capacity.",
    evidenceLabel: "Demand vs capacity",
    deltaDirection: "lower_is_better",
    href: "/availability",
  },
  "monitored systems": {
    definition:
      "Operational integrations and processing systems currently included in the system-health monitor.",
    evidenceLabel: "System health",
    deltaDirection: "neutral",
  },
  healthy: {
    definition:
      "Monitored systems currently operating within their configured health thresholds.",
    evidenceLabel: "System health",
    deltaDirection: "higher_is_better",
  },
  warnings: {
    definition:
      "Monitored systems that need review but are not currently classified as critical.",
    evidenceLabel: "System health",
    deltaDirection: "lower_is_better",
  },
  critical: {
    definition:
      "Monitored systems with a critical state such as a stuck event or failed latest run according to the health rules.",
    evidenceLabel: "System health",
    deltaDirection: "lower_is_better",
  },
  "events · 24h": {
    definition:
      "First-party tracking events received during the latest 24-hour window.",
    evidenceLabel: "Tracking evidence",
    deltaDirection: "neutral",
  },
  "visitors · 24h": {
    definition:
      "Anonymous first-party visitor identities observed during the latest 24-hour window.",
    evidenceLabel: "Tracking evidence",
    deltaDirection: "neutral",
  },
  "identified events": {
    definition:
      "Share of recent tracking events already linked to known CRM leads through the available identity evidence.",
    evidenceLabel: "Identity linkage",
    deltaDirection: "higher_is_better",
  },
  "ad click ids · 7d": {
    definition:
      "Tracking events in the latest seven-day window carrying supported advertising click identifiers such as Google or Meta IDs.",
    evidenceLabel: "Paid-media lineage",
    deltaDirection: "neutral",
  },
  "website enquiries · 24h": {
    definition:
      "Website enquiry submissions received through the CRM capture path during the latest 24-hour window.",
    evidenceLabel: "Lead capture",
    deltaDirection: "neutral",
  },
  "form starts · 7d": {
    definition:
      "Tracked browser form-start events observed during the latest seven-day window.",
    evidenceLabel: "Browser journey",
    deltaDirection: "neutral",
  },
  "contact cta clicks · 7d": {
    definition:
      "Tracked clicks on supported contact or booking calls-to-action during the latest seven-day window.",
    evidenceLabel: "Browser journey",
    deltaDirection: "neutral",
  },
  "website visitors · 7d": {
    definition:
      "Anonymous first-party visitors observed across tracked website activity during the latest seven-day window.",
    evidenceLabel: "Browser journey",
    deltaDirection: "neutral",
  },
  "knowledge items": {
    definition:
      "Knowledge documents currently visible in the workspace across active, review and archived states.",
    evidenceLabel: "Knowledge base",
    deltaDirection: "neutral",
  },
  approved: {
    definition:
      "Knowledge documents approved for use by the configured AI retrieval workflow.",
    evidenceLabel: "Knowledge base",
    deltaDirection: "neutral",
  },
  "draft / review": {
    definition:
      "Knowledge documents not yet approved for AI retrieval and still in draft or review state.",
    evidenceLabel: "Knowledge base",
    deltaDirection: "neutral",
  },
  archived: {
    definition:
      "Knowledge documents intentionally excluded from active retrieval because they are archived.",
    evidenceLabel: "Knowledge base",
    deltaDirection: "neutral",
  },
  "crm environment": {
    definition:
      "Current CRM data mode for this deployment, such as live Supabase-backed operation, mock data or incomplete setup.",
    evidenceLabel: "Configuration",
    deltaDirection: "neutral",
  },
  "forecast stages": {
    definition:
      "Pipeline stages currently configured with deterministic planning weights for revenue forecasting. Stage weights are not calibrated win probabilities.",
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

  if (
    [
      "warnings",
      "critical",
      "needs reply",
      "overdue follow-ups",
      "never contacted",
      "demand pressure",
    ].includes(key) &&
    numeric != null
  ) {
    return numeric > 0
      ? {
          tone: key === "critical" ? "critical" : "warning",
          statusLabel: key === "critical" ? "Action" : "Review",
        }
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
