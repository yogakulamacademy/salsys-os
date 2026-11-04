import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Activity, ArrowLeft, CheckCircle2, CircleDashed, LockKeyhole, ShieldAlert } from 'lucide-react';

import { getAiInsightPilotStatus } from '@/lib/ai/pilot-status';

export const dynamic = 'force-dynamic';

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-line bg-surface p-4">
      <p className="text-xs font-medium text-copy-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-copy">{value}</p>
      <p className="mt-1 text-xs leading-5 text-copy-muted">{note}</p>
    </div>
  );
}

export default async function AiInsightsOperationsPage() {
  let status: Awaited<ReturnType<typeof getAiInsightPilotStatus>>;
  try {
    status = await getAiInsightPilotStatus();
  } catch {
    return (
      <main className="mx-auto w-full max-w-4xl px-4 py-8">
        <Link href="/settings" className="text-xs text-copy-muted hover:text-copy">Back to settings</Link>
        <h1 className="mt-5 text-xl font-semibold text-copy">AI Lead Intelligence · Pilot operations</h1>
        <p role="alert" className="mt-4 rounded-lg border border-line p-4 text-sm text-copy">
          Operational metrics are temporarily unavailable. No AI activation changes were made.
        </p>
      </main>
    );
  }
  if (!status) notFound();

  const active = status.readiness === 'review_required';
  const ratio = status.usage.reviewCoveragePercent;

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6 sm:px-6">
      <Link href="/settings" className="inline-flex items-center gap-1.5 text-xs font-semibold text-copy-muted hover:text-copy">
        <ArrowLeft size={13} aria-hidden/> Back to settings
      </Link>

      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-copy-muted">Internal operations · Read only</p>
        <h1 className="text-2xl font-semibold text-copy">AI Lead Intelligence</h1>
        <p className="text-sm leading-6 text-copy-muted">
          Pilot readiness, usage limits and staff review quality for the active workspace.
          This page does not enable AI, update policies, or reveal customer messages.
        </p>
        <div className="flex flex-wrap items-center gap-3 text-xs text-copy-muted">
          <span className="inline-flex items-center gap-1.5">
            {active ? <ShieldAlert size={14} aria-hidden/> : <LockKeyhole size={14} aria-hidden/>}
            {active ? 'Manual approval still required' : 'Activation blocked'}
          </span>
          <span>{status.organizationName}</span>
          <span>Checked {new Date(status.observedAt).toLocaleString()}</span>
        </div>
      </header>

      <section aria-label="Usage statistics" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Attempts today" value={String(status.usage.attemptsToday)}
          note="Counts reserved model requests, including failures."/>
        <Stat label="Daily capacity" value={status.tenantPolicy.organizationDailyLimit == null ? 'Not set' : String(status.tenantPolicy.organizationDailyLimit)}
          note={status.tenantPolicy.enabled ? 'Tenant policy configured.' : 'Tenant is not opted in.'}/>
        <Stat label="Insight receipts · 7d" value={String(status.usage.runReceipts7d)}
          note="Only recorded when feedback capture is enabled."/>
        <Stat label="Staff reviews · 7d" value={String(status.usage.reviews7d)}
          note="Voluntary feedback, not validated model accuracy."/>
      </section>

      <section aria-labelledby="pilot-gates" className="rounded-xl border border-line bg-surface p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <Activity size={17} className="text-copy-muted" aria-hidden/>
          <h2 id="pilot-gates" className="text-base font-semibold text-copy">Pilot prerequisites</h2>
        </div>
        <p className="mt-1 text-xs leading-5 text-copy-muted">
          Green checks reflect configuration only. Consent, quality review and spend alerts require human verification.
        </p>
        <div className="mt-4 divide-y divide-line">
          {status.prerequisites.map(item => (
            <div key={item.key} className="flex gap-3 py-3">
              {item.state === 'ready'
                ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-copy" aria-hidden/>
                : <CircleDashed size={16} className="mt-0.5 shrink-0 text-copy-muted" aria-hidden/>}
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-copy">{item.title}</p>
                  <span className="text-[11px] text-copy-muted">
                    {item.state === 'ready' ? 'Configured' : item.state === 'disabled' ? 'Not enabled' : 'Manual verification'}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-5 text-copy-muted">{item.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-line bg-surface p-4">
          <h2 className="text-sm font-semibold text-copy">Human review signals</h2>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-copy">
            {ratio === null ? 'Not measurable' : `${ratio}%`}
          </p>
          <p className="mt-1 text-xs text-copy-muted">Distinct insight receipts reviewed, compared with receipts generated over 7 days.</p>
          <p className="mt-3 text-xs leading-5 text-copy-muted">
            {status.usage.quality.reviewCount} recent sampled review(s);
            {status.usage.quality.ratedInaccurate} marked inaccurate.
            {status.usage.reviewsSampleTruncated ? ' Sample is capped at 500 reviews.' : ''}
            These ratings do not establish calibrated accuracy.
          </p>
        </div>
        <div className="rounded-xl border border-line bg-surface p-4">
          <h2 className="text-sm font-semibold text-copy">Retention review</h2>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-copy">
            {status.retentionReview.receiptsOlderThanThreshold} older receipt(s)
          </p>
          <p className="mt-1 text-xs leading-5 text-copy-muted">
            Proposed {status.retentionReview.proposedThresholdDays}-day review threshold;
            {status.retentionReview.quotaCountersOlderThanThreshold} older quota counter(s).
          </p>
          <p className="mt-3 text-xs leading-5 text-copy-muted">
            No deletion or cleanup automation is enabled. Retention needs policy approval before activation.
          </p>
        </div>
      </section>
      <p className="text-xs text-copy-muted">
        Private operational readout for owner/admin roles only. All metrics are restricted to the active organization.
      </p>
    </main>
  );
}
