import Link from "next/link";
import { Activity, Target } from "lucide-react";

import { FunnelIntelligenceWorkspaceV2 } from "@/components/funnel-intelligence-workspace-v2";
import { ExecutiveDecisionBrief } from "@/components/marketing/executive-decision-brief";
import { PageHeader } from "@/components/ui";
import {
  getFunnelIntelligenceWorkspace,
  type FunnelIntelligenceWorkspace as FunnelWorkspace,
} from "@/lib/funnel-intelligence-data";

export default async function FunnelPage() {
  const workspace = await getFunnelIntelligenceWorkspace();
  const brief = buildFunnelDecisionBrief(workspace);

  return (
    <div className="growth-funnel-workspace space-y-4">
      <PageHeader
        eyebrow="SalsysOS / Growth Operations"
        title="Conversion Funnel"
        description="See where demand becomes qualified opportunity, where momentum is lost, and which conversion step deserves investigation next."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/marketing" className="btn-secondary">
              <Activity size={15} /> Growth overview
            </Link>
            <Link href="/attribution" className="btn-primary">
              <Target size={15} /> Attribution
            </Link>
          </div>
        }
      />

      {workspace.status.available && workspace.overview ? (
        <ExecutiveDecisionBrief
          title={brief.title}
          summary={brief.summary}
          confidenceLabel={brief.confidenceLabel}
          confidenceDetail={brief.confidenceDetail}
          signals={brief.signals}
          actions={brief.actions}
        />
      ) : null}

      <FunnelIntelligenceWorkspaceV2 workspace={workspace} />
    </div>
  );
}

function buildFunnelDecisionBrief(workspace: FunnelWorkspace) {
  if (!workspace.status.available || !workspace.overview) {
    return {
      title: "Funnel evidence is unavailable",
      summary: "SalsysOS is withholding funnel conclusions until the current cohort can be read safely.",
      confidenceLabel: "Evidence unavailable",
      confidenceDetail: "Unavailable reporting is not treated as zero performance.",
      signals: [],
      actions: [],
    };
  }

  const overview = workspace.overview;
  const businessJourney = workspace.journeys.find((journey) => journey.key === "business") ?? workspace.journeys[0];
  const drops = businessJourney
    ? businessJourney.stages.flatMap((stage, index) => {
        if (index === 0) return [];
        const previous = businessJourney.stages[index - 1];
        if (previous.unit !== stage.unit || previous.count <= 0) return [];
        const rate = (stage.count / previous.count) * 100;
        return [{ from: previous.label, to: stage.label, rate, lost: Math.max(0, previous.count - stage.count) }];
      })
    : [];
  const largestDrop = [...drops].sort((a, b) => a.rate - b.rate)[0] ?? null;

  const strongestSource = [...workspace.sources].sort((a, b) => {
    if (b.enrolled !== a.enrolled) return b.enrolled - a.enrolled;
    if (b.qualified !== a.qualified) return b.qualified - a.qualified;
    return b.leads - a.leads;
  })[0];

  const coverage = workspace.measurement?.first_touch_coverage ?? null;
  const coveragePct = coverage == null ? null : coverage <= 1 ? coverage * 100 : coverage;
  const enrolledRate = overview.leads > 0 ? (overview.enrolled / overview.leads) * 100 : null;
  const qualifiedRate = overview.leads > 0 ? (overview.qualified / overview.leads) * 100 : null;

  const title = largestDrop
    ? `${largestDrop.from} → ${largestDrop.to} is the conversion step to investigate first.`
    : "The funnel is connected; focus on the strongest observed conversion evidence.";

  const summary = largestDrop
    ? `${largestDrop.lost.toLocaleString("en-IN")} records are currently between those two comparable stages. SalsysOS is surfacing the observed gap, not assuming why it happened. Segment by source, journey and follow-up evidence before changing spend or messaging.`
    : "No comparable stage produces a clear dominant drop in the current cohort. Use source performance and measurement coverage to decide where to inspect next.";

  return {
    title,
    summary,
    confidenceLabel: coveragePct == null ? "Coverage unknown" : `${coveragePct.toFixed(0)}% first-touch coverage`,
    confidenceDetail:
      coveragePct == null
        ? "The current read does not contain a reliable first-touch coverage denominator, so acquisition confidence remains unknown."
        : `${workspace.measurement?.known_first_touch.toLocaleString("en-IN") ?? 0} of ${workspace.measurement?.total_leads.toLocaleString("en-IN") ?? 0} leads have known first-touch evidence. Funnel stage rates are calculated only across comparable counting units.`,
    signals: [
      {
        label: "Largest comparable drop",
        value: largestDrop ? `${largestDrop.rate.toFixed(1)}% continue` : "No dominant drop",
        detail: largestDrop ? `${largestDrop.from} → ${largestDrop.to}` : "No valid adjacent-stage denominator stands out.",
        tone: largestDrop && largestDrop.rate < 35 ? ("risk" as const) : ("watch" as const),
      },
      {
        label: "Lead → qualified",
        value: qualifiedRate == null ? "—" : `${qualifiedRate.toFixed(1)}%`,
        detail: `${overview.qualified.toLocaleString("en-IN")} qualified from ${overview.leads.toLocaleString("en-IN")} leads.`,
        tone: qualifiedRate != null && qualifiedRate >= 35 ? ("positive" as const) : ("neutral" as const),
      },
      {
        label: "Lead → enrolled",
        value: enrolledRate == null ? "—" : `${enrolledRate.toFixed(1)}%`,
        detail: `${overview.enrolled.toLocaleString("en-IN")} enrollments in the current cohort.`,
        tone: enrolledRate != null && enrolledRate > 0 ? ("positive" as const) : ("neutral" as const),
      },
      {
        label: "Strongest observed source",
        value: strongestSource?.source || "Unknown",
        detail: strongestSource
          ? `${strongestSource.qualified.toLocaleString("en-IN")} qualified · ${strongestSource.enrolled.toLocaleString("en-IN")} enrolled.`
          : "No source-level CRM evidence is available.",
        tone: strongestSource?.enrolled ? ("positive" as const) : ("neutral" as const),
      },
    ],
    actions: [
      { label: "Inspect attribution", href: "/attribution", detail: "Compare source evidence across attribution models." },
      { label: "Review re-engaged leads", href: "/re-engaged", detail: "Prioritize returning leads with current intent evidence." },
      { label: "Check tracking health", href: "/tracking/data-coverage", detail: "Validate evidence completeness before diagnosing performance." },
    ],
  };
}
