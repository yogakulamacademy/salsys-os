export type MetricRelatedLink = {
  label: string;
  href: string;
};

export function resolveMetricNextCheck(metricLabel: string): string | null {
  const metric = metricLabel.trim().toLowerCase();

  if (metric.includes("lead creation") || metric.includes("last marketing touch")) {
    return "Compare the exact authorized lead cohort with Admissions workload and valued Revenue opportunities; do not substitute first-touch or current-channel evidence.";
  }

  if (metric === "new leads" || metric.includes("first touch")) {
    return "Confirm ownership and first-touch status before judging lead quality or escalating priority.";
  }

  if (
    metric.includes("capacity") ||
    metric.includes("calculated open") ||
    metric.includes("demand pressure") ||
    metric.includes("seats remain") ||
    metric.includes("upcoming batches") ||
    metric.includes("enrollment closed")
  ) {
    return "Compare hot prospects and payment-stage demand with calculated open seats before committing availability.";
  }

  if (
    metric.includes("contact coverage") ||
    metric.includes("median first response") ||
    metric.includes("median inbound response") ||
    metric.includes("never contacted") ||
    metric.includes("response time") ||
    metric.includes("response rate")
  ) {
    return "Review the oldest uncovered leads and SLA evidence; historical contact logs may be incomplete.";
  }

  if (
    metric.includes("inbound contacts") ||
    metric.includes("outbound contacts") ||
    metric.includes("total contacts") ||
    metric.includes("marked successful")
  ) {
    return "Use contact volume as activity evidence only; inspect customer outcomes separately before judging performance.";
  }

  if (metric.includes("payment")) {
    return "Resolve payment proof, questions and recorded outstanding balances before treating the opportunity as enrolled.";
  }

  if (metric.includes("qualified")) {
    return "Compare qualified-stage movement with funnel evidence; CRM stage is not a calibrated win probability.";
  }

  if (metric.includes("enroll")) {
    return "Reconcile enrollment state with payment evidence and delivery readiness before using it as commercial truth.";
  }

  if (metric.includes("collected") || metric.includes("revenue")) {
    return "Reconcile payment evidence in original currency before comparing commercial performance across periods or sources.";
  }

  if (metric.includes("reply")) {
    return "Prioritize the oldest waiting conversations; a reply-needed state does not by itself imply customer intent.";
  }

  if (metric.includes("follow")) {
    return "Clear overdue scheduled actions first, then reassess the remaining queue priority.";
  }

  if (metric.includes("pipeline") || metric.includes("high intent")) {
    return "Check stage age, recorded next action and payment readiness before escalating the opportunity.";
  }

  if (metric.includes("lead")) {
    return "Review the CRM record and attribution evidence separately; source coverage can be incomplete.";
  }

  return null;
}

export function resolveMetricRelatedLinks(metricLabel: string): MetricRelatedLink[] {
  const metric = metricLabel.trim().toLowerCase();

  if (metric.includes("lead creation") || metric.includes("last marketing touch")) {
    return [
      { label: "Admissions Queue", href: "/admissions?view=queue" },
      { label: "Revenue", href: "/revenue" },
    ];
  }

  if (metric === "new leads" || metric.includes("first touch")) {
    return [
      { label: "Work Queue", href: "/admissions?view=queue" },
      { label: "Leads", href: "/leads" },
    ];
  }

  if (
    metric.includes("capacity") ||
    metric.includes("calculated open") ||
    metric.includes("demand pressure") ||
    metric.includes("seats remain") ||
    metric.includes("upcoming batches") ||
    metric.includes("enrollment closed")
  ) {
    return [
      { label: "Admissions Capacity", href: "/admissions?view=capacity" },
      { label: "Operations", href: "/operations" },
    ];
  }

  if (
    metric.includes("contact coverage") ||
    metric.includes("median first response") ||
    metric.includes("median inbound response") ||
    metric.includes("never contacted") ||
    metric.includes("response time") ||
    metric.includes("response rate")
  ) {
    return [
      { label: "Response & SLA", href: "/performance?view=response" },
      { label: "Leads", href: "/leads" },
    ];
  }

  if (
    metric.includes("inbound contacts") ||
    metric.includes("outbound contacts") ||
    metric.includes("total contacts") ||
    metric.includes("marked successful")
  ) {
    return [
      { label: "Communication", href: "/performance?view=communication" },
      { label: "Leads", href: "/leads" },
    ];
  }

  if (metric.includes("payment")) {
    return [
      { label: "Payments", href: "/admissions?view=payments" },
      { label: "Revenue", href: "/revenue" },
    ];
  }

  if (metric.includes("qualified")) {
    return [
      { label: "Funnel", href: "/marketing?view=funnel" },
      { label: "Pipeline", href: "/admissions?view=pipeline" },
    ];
  }

  if (metric.includes("enroll")) {
    return [
      { label: "Pipeline", href: "/admissions?view=pipeline" },
      { label: "Revenue", href: "/revenue" },
    ];
  }

  if (metric.includes("collected") || metric.includes("revenue")) {
    return [
      { label: "Revenue", href: "/revenue" },
      { label: "Payments", href: "/admissions?view=payments" },
    ];
  }

  if (metric.includes("reply")) {
    return [
      { label: "Inbox", href: "/conversations" },
      { label: "Response & SLA", href: "/performance?view=response" },
    ];
  }

  if (metric.includes("follow")) {
    return [
      { label: "Follow-ups", href: "/follow-ups" },
      { label: "Work Queue", href: "/admissions?view=queue" },
    ];
  }

  if (metric.includes("pipeline") || metric.includes("high intent")) {
    return [
      { label: "Pipeline", href: "/admissions?view=pipeline" },
      { label: "Revenue", href: "/revenue" },
    ];
  }

  if (metric.includes("lead")) {
    return [
      { label: "Leads", href: "/leads" },
      { label: "Attribution", href: "/marketing?view=attribution" },
    ];
  }

  return [];
}
