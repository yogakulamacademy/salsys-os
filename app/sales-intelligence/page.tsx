import Link from 'next/link';
import {
  ArrowRight,
  BrainCircuit,
  Flame,
  Layers3,
  MessageCircleReply,
  Target,
} from 'lucide-react';

import { PageHeader } from '@/components/ui';
import { getR6SalesIntelligence, type LeadSalesIntelligenceRow } from '@/lib/r6-sales-intelligence';

export default async function SalesIntelligencePage() {
  const { rows, warning } = await getR6SalesIntelligence(150);

  const needsReply = rows.filter((row) => row.needsReply).length;
  const reengaged = rows.filter((row) => row.isReengaged).length;
  const strongAffinity = rows.filter((row) => (row.strongestAffinityScore ?? 0) >= 80).length;
  const multipleProducts = rows.filter((row) => row.affinityCourseCount > 1).length;

  return (
    <div className="sales-intelligence-polish">
      <PageHeader
        eyebrow="Sales intelligence"
        title="Intent & Product Affinity"
        description="Observed CRM intent, website behaviour, Person-level course affinity and operational next steps in one tenant-safe sales view."
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
          icon={<MessageCircleReply size={17} />}
          label="Needs reply"
          value={needsReply}
          note="Current customer reply pressure"
        />
        <MetricCard
          icon={<Flame size={17} />}
          label="Re-engaged"
          value={reengaged}
          note="Recent return behaviour detected"
        />
        <MetricCard
          icon={<Target size={17} />}
          label="Strong affinity"
          value={strongAffinity}
          note="Affinity score 80+ from observed evidence"
        />
        <MetricCard
          icon={<Layers3 size={17} />}
          label="Multi-course interest"
          value={multipleProducts}
          note="More than one observed course affinity"
        />
      </section>

      <section className="card-pad mt-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="eyebrow">Operator queue</div>
            <div className="section-title mt-1">Lead-level sales evidence</div>
            <p className="mt-2 max-w-3xl text-xs leading-5 text-slate-400">
              Intent, behaviour and affinity are shown as separate observed evidence. Priority and next action remain deterministic operating guidance; this view does not claim predictive probability or causal attribution.
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
            <table className="min-w-[1180px] w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="px-3 py-3">Lead</th>
                  <th className="px-3 py-3">Intent</th>
                  <th className="px-3 py-3">Behaviour</th>
                  <th className="px-3 py-3">Strongest affinity</th>
                  <th className="px-3 py-3">Alternate interest</th>
                  <th className="px-3 py-3">Primary signal</th>
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
        {row.needsReply && (
          <span className="mt-2 inline-flex rounded-lg bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-700">
            Needs reply
          </span>
        )}
      </td>

      <td className="px-3 py-4">
        <Pill value={pretty(row.crmIntent)} />
        {row.interestedCourseName && (
          <div className="mt-2 max-w-[180px] text-xs leading-5 text-slate-500">
            CRM course: {row.interestedCourseName}
          </div>
        )}
      </td>

      <td className="px-3 py-4">
        <Pill value={pretty(row.behaviourTemperature)} tone={temperatureTone(row.behaviourTemperature)} />
        <div className="mt-2 text-xs text-slate-500">Engagement {Math.round(row.engagementScore)}/100</div>
        {row.behaviourReason && <div className="mt-1 max-w-[170px] text-[11px] text-slate-400">{row.behaviourReason}</div>}
      </td>

      <td className="px-3 py-4">
        {row.strongestAffinityCourseName ? (
          <>
            <div className="max-w-[190px] font-semibold text-slate-700">{row.strongestAffinityCourseName}</div>
            <div className="mt-1 text-xs text-slate-500">
              Score {row.strongestAffinityScore ?? 0} · {pretty(row.strongestAffinityEvidence || 'observed')}
            </div>
          </>
        ) : (
          <span className="text-slate-400">No resolved affinity</span>
        )}
      </td>

      <td className="px-3 py-4">
        {row.alternateAffinityCourseName ? (
          <>
            <div className="max-w-[190px] font-medium text-slate-700">{row.alternateAffinityCourseName}</div>
            <div className="mt-1 text-xs text-slate-500">
              Score {row.alternateAffinityScore ?? 0} · {pretty(row.alternateAffinityEvidence || 'observed')}
            </div>
          </>
        ) : (
          <span className="text-slate-400">—</span>
        )}
      </td>

      <td className="px-3 py-4">
        <Pill value={pretty(row.primarySalesSignal)} />
        {row.isReengaged && <div className="mt-2 text-[11px] font-semibold text-violet-600">Re-engaged</div>}
      </td>

      <td className="px-3 py-4 text-right">
        <div className="font-bold text-slate-800">{Math.round(row.priorityScore)}</div>
        <div className="mt-1 text-[11px] text-slate-400">{pretty(row.priorityBand)}</div>
      </td>

      <td className="px-3 py-4">
        <div className="max-w-[220px] font-semibold text-slate-700">
          {row.nextBestAction || 'Review lead'}
        </div>
        {row.salesEvidence.length > 0 && (
          <div className="mt-2 max-w-[240px] text-[11px] leading-5 text-slate-400">
            {row.salesEvidence.slice(0, 3).join(' · ')}
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
  icon: React.ReactNode;
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

function Pill({ value, tone = 'slate' }: { value: string; tone?: 'slate' | 'amber' | 'emerald' | 'violet' }) {
  const classes = {
    slate: 'bg-slate-100 text-slate-600',
    amber: 'bg-amber-50 text-amber-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    violet: 'bg-violet-50 text-violet-700',
  }[tone];

  return <span className={`inline-flex rounded-lg px-2.5 py-1 text-[11px] font-bold ${classes}`}>{value}</span>;
}

function temperatureTone(value: string): 'slate' | 'amber' | 'emerald' | 'violet' {
  if (value === 'hot') return 'amber';
  if (value === 'warm') return 'violet';
  if (value === 'cold') return 'slate';
  return 'slate';
}

function pretty(value: string) {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
