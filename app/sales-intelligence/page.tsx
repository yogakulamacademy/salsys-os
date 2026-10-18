import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  ArrowRight,
  BrainCircuit,
  Flame,
  Gauge,
  Layers3,
  Target,
} from 'lucide-react';

import { PageHeader } from '@/components/ui';
import { getR6SalesIntelligence, type LeadSalesIntelligenceRow } from '@/lib/r6-sales-intelligence';

export default async function SalesIntelligencePage() {
  const { rows, warning } = await getR6SalesIntelligence(150);

  const highIntent = rows.filter((row) => row.derivedIntent === 'high' || row.derivedIntent === 'very_high').length;
  const highConfidence = rows.filter((row) => row.intentConfidence === 'high').length;
  const strongAffinity = rows.filter((row) => (row.recommendedAffinityScore ?? 0) >= 80).length;
  const multipleProducts = rows.filter((row) => row.candidateCourseCount > 1).length;

  return (
    <div className="sales-intelligence-polish">
      <PageHeader
        eyebrow="Sales intelligence"
        title="Intent & Product Affinity"
        description="Observed CRM stage, customer behaviour, Person-level course affinity and deterministic sales guidance in one tenant-safe view."
        actions={
          <Link href="/intelligence" className="btn-primary">
            <BrainCircuit size={15} />
            System Intelligence
            <ArrowRight size={14} />
          </Link>
        }
      />

      {warning && (
        <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700">
          {warning}
        </div>
      )}

      <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={<Flame size={17} />}
          label="High intent"
          value={highIntent}
          note="Derived high / very-high intent from observed evidence"
        />
        <MetricCard
          icon={<Gauge size={17} />}
          label="High confidence"
          value={highConfidence}
          note="Intent classification backed by stronger evidence"
        />
        <MetricCard
          icon={<Target size={17} />}
          label="Strong affinity"
          value={strongAffinity}
          note="Recommended course affinity score 80+"
        />
        <MetricCard
          icon={<Layers3 size={17} />}
          label="Multi-course interest"
          value={multipleProducts}
          note="More than one resolved course candidate"
        />
      </section>

      <section className="card-pad mt-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="eyebrow">Operator queue</div>
            <div className="section-title mt-1">Lead-level sales evidence</div>
            <p className="mt-2 max-w-3xl text-xs leading-5 text-slate-400">
              Stored CRM intent and derived intent remain separate. Course recommendations come from resolved Person-level affinity evidence. Priority and next action are deterministic operating guidance, not predictive probability or causal attribution.
            </p>
          </div>
          <span className="rounded-lg bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-500">
            {rows.length} leads
          </span>
        </div>

        {rows.length === 0 ? (
          <div className="mt-5 rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400">
            No sales-intelligence rows are available yet.
          </div>
        ) : (
          <div className="mt-5 overflow-x-auto">
            <table className="min-w-[1280px] w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="px-3 py-3">Lead</th>
                  <th className="px-3 py-3">Derived intent</th>
                  <th className="px-3 py-3">Confidence</th>
                  <th className="px-3 py-3">Behaviour</th>
                  <th className="px-3 py-3">Course affinity</th>
                  <th className="px-3 py-3">Evidence</th>
                  <th className="px-3 py-3 text-right">Priority</th>
                  <th className="px-3 py-3">Next action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <LeadRow key={row.leadId} row={row} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function LeadRow({ row }: { row: LeadSalesIntelligenceRow }) {
  return (
    <tr className="border-b border-slate-50 align-top last:border-0">
      <td className="px-3 py-4">
        <Link href={`/leads/${row.leadId}`} className="font-semibold text-slate-800 hover:text-brand hover:underline">
          {row.leadName}
        </Link>
        <div className="mt-1 text-[11px] text-slate-400">
          {row.leadCode} · {pretty(row.currentStage)}
        </div>
        {row.personMappingConflict && (
          <span className="mt-2 inline-flex rounded-lg bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-700">
            Identity conflict
          </span>
        )}
      </td>

      <td className="px-3 py-4">
        <Pill value={pretty(row.derivedIntent)} tone={intentTone(row.derivedIntent)} />
        <div className="mt-2 text-[11px] text-slate-400">
          Stored CRM: {pretty(row.storedIntent)}
        </div>
      </td>

      <td className="px-3 py-4">
        <Pill value={pretty(row.intentConfidence)} tone={confidenceTone(row.intentConfidence)} />
        <div className="mt-2 max-w-[170px] text-[11px] leading-5 text-slate-400">
          Basis: {pretty(row.intentBasis)}
        </div>
      </td>

      <td className="px-3 py-4">
        <Pill value={pretty(row.behaviourTemperature)} tone={temperatureTone(row.behaviourTemperature)} />
        <div className="mt-2 text-xs text-slate-500">Engagement {Math.round(row.engagementScore)}/100</div>
        <div className="mt-1 text-[11px] text-slate-400">
          {row.sessions7d} sessions · {row.pageViews7d} page views · {row.highIntentEvents7d} high-intent events
        </div>
        {row.isReengaged && <div className="mt-1 text-[11px] font-semibold text-violet-600">Recently re-engaged</div>}
      </td>

      <td className="px-3 py-4">
        {row.recommendedCourseName ? (
          <>
            <div className="max-w-[210px] font-semibold text-slate-700">{row.recommendedCourseName}</div>
            <div className="mt-1 text-xs text-slate-500">
              Affinity {row.recommendedAffinityScore ?? 0} · {pretty(row.recommendationBasis || 'observed')}
            </div>
            {row.candidateCourseCount > 1 && (
              <div className="mt-1 text-[11px] text-slate-400">{row.candidateCourseCount} course candidates observed</div>
            )}
          </>
        ) : (
          <span className="text-slate-400">No resolved course recommendation</span>
        )}
      </td>

      <td className="px-3 py-4">
        {row.intentReasonCodes.length > 0 ? (
          <div className="max-w-[230px] text-[11px] leading-5 text-slate-500">
            {row.intentReasonCodes.slice(0, 4).map(pretty).join(' · ')}
          </div>
        ) : (
          <span className="text-slate-400">Limited intent evidence</span>
        )}
        {row.recommendationReasonCodes.length > 0 && (
          <div className="mt-2 max-w-[230px] text-[11px] leading-5 text-slate-400">
            Product: {row.recommendationReasonCodes.slice(0, 3).map(pretty).join(' · ')}
          </div>
        )}
      </td>

      <td className="px-3 py-4 text-right">
        <div className="font-bold text-slate-800">{Math.round(row.priorityScore)}</div>
        <div className="mt-1 text-[11px] text-slate-400">{pretty(row.priorityBand)}</div>
      </td>

      <td className="px-3 py-4">
        <div className="max-w-[230px] font-semibold text-slate-700">
          {row.nextBestAction || 'Review lead'}
        </div>
        {row.priorityReason && (
          <div className="mt-2 max-w-[240px] text-[11px] leading-5 text-slate-400">
            {row.priorityReason}
          </div>
        )}
        <Link href={`/leads/${row.leadId}`} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline">
          Open lead <ArrowRight size={12} />
        </Link>
      </td>
    </tr>
  );
}

function MetricCard({
  icon,
  label,
  value,
  note,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  note: string;
}) {
  return (
    <div className="card-pad">
      <div className="flex items-center gap-2 text-slate-400">
        {icon}
        <span className="text-xs font-bold uppercase tracking-wide">{label}</span>
      </div>
      <div className="mt-3 text-2xl font-bold text-slate-800">{value.toLocaleString('en-IN')}</div>
      <div className="mt-1 text-xs leading-5 text-slate-400">{note}</div>
    </div>
  );
}

function Pill({ value, tone = 'slate' }: { value: string; tone?: 'slate' | 'amber' | 'emerald' | 'violet' | 'red' }) {
  const classes = {
    slate: 'bg-slate-100 text-slate-600',
    amber: 'bg-amber-50 text-amber-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    violet: 'bg-violet-50 text-violet-700',
    red: 'bg-red-50 text-red-700',
  }[tone];

  return <span className={`inline-flex rounded-lg px-2.5 py-1 text-[11px] font-bold ${classes}`}>{value}</span>;
}

function intentTone(value: string): 'slate' | 'amber' | 'emerald' | 'violet' | 'red' {
  if (value === 'very_high') return 'emerald';
  if (value === 'high') return 'amber';
  if (value === 'medium') return 'violet';
  return 'slate';
}

function confidenceTone(value: string): 'slate' | 'amber' | 'emerald' | 'violet' | 'red' {
  if (value === 'high') return 'emerald';
  if (value === 'medium') return 'violet';
  return 'slate';
}

function temperatureTone(value: string): 'slate' | 'amber' | 'emerald' | 'violet' | 'red' {
  if (value === 'hot') return 'amber';
  if (value === 'warm') return 'violet';
  if (value === 'closed') return 'red';
  return 'slate';
}

function pretty(value: string) {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
