import Link from 'next/link';
import { ArrowLeft, Brain, Search, Swords } from 'lucide-react';

import { SeoCompetitorIntelligence } from '@/components/seo-competitor-intelligence';
import { PageHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default function SeoCompetitorsPage() {
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Competitive organic intelligence"
        title="Competitors & Live Rankings"
        description="Track organic rankings, answer-engine visibility and AI citations, compare observed competitors, use Claude for grounded strategy, and export the evidence for your team."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/seo/decisions" className="btn-secondary">
              <Brain size={15} />
              Decision intelligence
            </Link>
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

      <section className="rounded-2xl border border-sky-100 bg-sky-50/70 px-4 py-4 text-sm text-sky-900">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-sky-600 shadow-sm">
            <Swords size={17} />
          </span>
          <div>
            <div className="font-semibold">Observed evidence first</div>
            <p className="mt-1 max-w-4xl text-xs leading-5 text-sky-700">
              Search Console remains the source for finalized historical Google performance. Live SEO, AEO and GEO checks use a dedicated ranking provider when configured. Claude analyzes those observations and proposes actions, but it is never treated as the source of ranking truth.
            </p>
          </div>
        </div>
      </section>

      <SeoCompetitorIntelligence />
    </div>
  );
}
