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
    <div className="commercial-intelligence-polish">
      <PageHeader
        eyebrow="Decision intelligence"
        title="Commercial Intelligence"
        description="One explainable view of funnel leakage, attribution quality, revenue readiness and payment-to-source reconciliation. SalsysOS uses observed facts and deterministic diagnostics here—not invented conversions or uncalibrated probabilities."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/funnel" className="btn-secondary">
              <GitBranch size={15} />
              Funnel
            </Link>
            <Link href="/attribution" className="btn-secondary">
              <Route size={15} />
              Attribution
            </Link>
            <Link href="/revenue" className="btn-primary">
              <CircleDollarSign size={15} />
              Revenue
              <ArrowRight size={14} />
            </Link>
          </div>
        }
      />

      <section className="mt-6 grid gap-3 md:grid-cols-3">
        <SummaryCard
          icon={<Sparkles size={18} />}
          label="Commercial evidence readiness"
          value={`${averageReadiness}/100`}
          detail="Average of funnel evidence, attribution coverage and forecast data readiness."
        />
        <SummaryCard
          icon={<Route size={18} />}
          label="Recommended actions"
          value={actionCount.toLocaleString("en-IN")}
          detail="Explainable actions generated from current observed gaps and opportunities."
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
          detail="Compares canonical Revenue payment truth with Attribution payment totals by currency."
        />
      </section>

      <RevenueAttributionReconciliationCard reconciliation={reconciliation} />

      <CommercialIntelligencePanel brief={funnelBrief} />
      <CommercialIntelligencePanel brief={attributionBrief} />
      <CommercialIntelligencePanel brief={revenueBrief} />

      <section className="card-pad mt-4 border border-slate-200 bg-slate-50/50">
        <div className="eyebrow">Interpretation guardrail</div>
        <div className="section-title mt-1">Smart does not mean speculative</div>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-500">
          These diagnostics rank observed bottlenecks, completeness gaps and
          commercial follow-up opportunities. They do not label missing behavior
          as negative intent, do not merge currencies without an explicit FX
          layer, and do not present stage weights or readiness scores as calibrated
          conversion probabilities. Predictive claims stay blocked until real
          outcome evidence is sufficient for evaluation and promotion.
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
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.08em] text-slate-400">
        <span className="text-violet-600">{icon}</span>
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-slate-900">{value}</div>
      <p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p>
    </div>
  );
}
