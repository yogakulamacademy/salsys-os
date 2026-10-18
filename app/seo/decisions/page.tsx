import Link from "next/link";
import { ArrowLeft, Brain, Search } from "lucide-react";

import { SeoDecisionForecastPanel } from "@/components/seo-decision-forecast-panel";
import { SeoDecisionWorkspace } from "@/components/seo-decision-workspace";
import { SeoOpportunityPortfolio } from "@/components/seo-opportunity-portfolio";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default function SeoDecisionPage() {
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Organic growth operating system"
        title="SEO Decision Intelligence"
        description="See the next best SEO action, why it ranks first, the modeled business upside, how historical experiments influence the score, and what the system is currently learning."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/seo/intelligence" className="btn-secondary">
              <Search size={15} />
              Intelligence search
            </Link>
            <Link href="/seo" className="btn-secondary">
              <ArrowLeft size={15} />
              SEO overview
            </Link>
          </div>
        }
      />

      <section className="rounded-2xl border border-emerald-100 bg-emerald-50/70 px-4 py-4 text-sm text-emerald-900">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-emerald-600 shadow-sm">
            <Brain size={17} />
          </span>
          <div>
            <div className="font-semibold">Decision first, dashboard second</div>
            <p className="mt-1 max-w-4xl text-xs leading-5 text-emerald-700">
              This workspace combines live search demand, content quality, revenue, AEO/GEO readiness, cannibalization and experiment learning. Forecasts are bounded scenarios using observed funnel data, while recommendations remain human-approved before execution.
            </p>
          </div>
        </div>
      </section>

      <SeoDecisionForecastPanel />
      <SeoOpportunityPortfolio />
      <SeoDecisionWorkspace />
    </div>
  );
}
