import type { ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CircleDollarSign,
  GitBranch,
  Route,
  Sparkles,
} from "lucide-react";

import {
  CommercialIntelligencePanel,
  RevenueAttributionReconciliationCard,
} from "@/components/commercial-intelligence-panel";
import { PaidMediaIntelligencePanel } from "@/components/paid-media-intelligence-panel";
import { PageHeader } from "@/components/ui";
import { getAttributionWorkspace } from "@/lib/attribution-data";
import {
  buildAttributionIntelligence,
  buildFunnelIntelligence,
  buildRevenueIntelligence,
  reconcileRevenueAttribution,
} from "@/lib/commercial-intelligence";
import { getFunnelWorkspace } from "@/lib/funnel-data";
import { getRevenueWorkspace } from "@/lib/revenue-data";

export default async function CommercialIntelligencePage() {
  const currentMonth = new Date().toISOString().slice(0, 7);

  const [funnel, attribution, revenue] = await Promise.all([
    getFunnelWorkspace(),
    getAttributionWorkspace({
      query: "",
      course: "all",
      location: "all",
      country: "all",
      stage: "all",
    }),
    getRevenueWorkspace(currentMonth),
  ]);

  const funnelBrief = buildFunnelIntelligence(funnel);
  const attributionBrief = buildAttributionIntelligence(attribution.workspace);
  const revenueBrief = buildRevenueIntelligence(revenue);
  const reconciliation = reconcileRevenueAttribution(
    attribution.workspace,
    revenue,
  );

  const averageReadiness = Math.round(
    (funnelBrief.readinessScore +
      attributionBrief.readinessScore +
      revenueBrief.readinessScore) /
      3,
  );

  const actionCount =
    funnelBrief.actions.length +
    attributionBrief.actions.length +
    revenueBrief.actions.length;

  return (
    <div className="commercial-intelligence-polish ui-page space-y-4">
      <PageHeader
        eyebrow="Decision intelligence"
        title="Commercial Intelligence"
        description="Understand where commercial evidence is strong, where the funnel is leaking, and which next actions are supported by observed data. SalsysOS keeps recommendations explainable and blocks speculative conversion claims."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/funnel" className="btn btn-secondary inline-flex items-center gap-2">
              <GitBranch size={15} />
              Funnel
            </Link>
            <Link href="/attribution" className="btn btn-secondary inline-flex items-center gap-2">
              <Route size={15} />
              Attribution
            </Link>
            <Link href="/revenue" className="btn btn-primary inline-flex items-center gap-2">
              <CircleDollarSign size={15} />
              Revenue
              <ArrowRight size={14} />
            </Link>
          </div>
        }
      />

      <section className="grid gap-4 md:grid-cols-3">
        <SummaryCard
          icon={<Sparkles size={18} />}
          label="Commercial evidence readiness"
          value={`${averageReadiness}/100`}
          detail="Average readiness across funnel evidence, attribution coverage and revenue forecasting inputs."
        />
        <SummaryCard
          icon={<Route size={18} />}
          label="Recommended actions"
          value={actionCount.toLocaleString("en-IN")}
          detail="Explainable next actions generated only from observed gaps and opportunities."
        />
        <SummaryCard
          icon={<CircleDollarSign size={18} />}
          label="Revenue lineage"
          value={
            reconciliation.status === "aligned"
              ? "Aligned"
              : reconciliation.status === "review"
                ? "Review"
                : "Pending"
          }
          detail="Checks canonical Revenue payment truth against Attribution payment totals by currency."
        />
      </section>

      <RevenueAttributionReconciliationCard reconciliation={reconciliation} />

      <PaidMediaIntelligencePanel
        google={funnel.googleAds}
        meta={funnel.metaAds}
      />

      <CommercialIntelligencePanel brief={funnelBrief} />
      <CommercialIntelligencePanel brief={attributionBrief} />
      <CommercialIntelligencePanel brief={revenueBrief} />

      <section className="ui-panel-muted p-5">
        <div className="ui-page-kicker">Interpretation guardrail</div>
        <div className="mt-1 text-[16px] font-semibold text-[var(--app-text-strong)]">
          Smart does not mean speculative
        </div>
        <p className="mt-2 max-w-4xl text-[13px] leading-6 text-[var(--app-text-muted)]">
          These diagnostics rank observed bottlenecks, completeness gaps,
          paid-media efficiency and commercial follow-up opportunities. They do
          not label missing behavior as negative intent, do not merge currencies
          without an explicit FX layer, and do not present stage weights or
          readiness scores as calibrated conversion probabilities. Predictive
          claims stay blocked until real outcome evidence is sufficient for
          evaluation and promotion.
        </p>
      </section>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="ui-panel p-5">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--app-brand-50)] text-[var(--app-brand-700)]">
          {icon}
        </span>
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--app-text-subtle)]">
          {label}
        </div>
      </div>
      <div className="mt-3 text-[28px] font-semibold tracking-[-0.035em] text-[var(--app-text-strong)]">
        {value}
      </div>
      <p className="mt-1.5 text-[13px] leading-5 text-[var(--app-text-muted)]">
        {detail}
      </p>
    </div>
  );
}
