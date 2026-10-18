import Link from "next/link";
import { ArrowLeft, Brain, Search, Sparkles } from "lucide-react";

import { ClaudeSeoIntelligence } from "@/components/claude-seo-intelligence";
import { SeoIntelligenceSearch } from "@/components/seo-intelligence-search";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default function SeoIntelligencePage() {
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Organic growth intelligence"
        title="SEO Intelligence Search"
        description="Explore pages, topics, entities, experiments and optimization actions with tenant-safe OpenSearch ranking across SEO, AEO, GEO, traffic and business-value signals."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/seo/decisions" className="btn-secondary">
              <Brain size={15} />
              Decision Intelligence
            </Link>
            <Link href="/seo" className="btn-secondary">
              <ArrowLeft size={15} />
              SEO overview
            </Link>
          </div>
        }
      />

      <section className="rounded-2xl border border-violet-100 bg-violet-50/60 px-4 py-4 text-sm text-violet-900">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-violet-600 shadow-sm">
            <Sparkles size={17} />
          </span>
          <div>
            <div className="font-semibold">Dynamic SEO retrieval, not a static report</div>
            <p className="mt-1 max-w-4xl text-xs leading-5 text-violet-700">
              Search combines textual relevance with live opportunity, traffic, revenue, AEO and GEO scores. The underlying index remains tenant-bound and only contains explicitly allowlisted SEO fields.
            </p>
          </div>
          <Search size={18} className="ml-auto mt-1 hidden shrink-0 text-violet-400 sm:block" />
        </div>
      </section>

      <ClaudeSeoIntelligence />
      <SeoIntelligenceSearch />
    </div>
  );
}
