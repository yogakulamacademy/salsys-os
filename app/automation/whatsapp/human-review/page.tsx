import Link from 'next/link';

import { getCurrentDeskcommHumanReviewQueue } from '@/lib/integrations/deskcomm-human-review-data';

export const dynamic = 'force-dynamic';

export default async function WhatsAppHumanReviewQueuePage() {
  const queue = await getCurrentDeskcommHumanReviewQueue();
  return (
    <main className="mx-auto max-w-5xl space-y-5 pb-10">
      <header>
        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
          WhatsApp · inbound shadow · owner/admin review
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">
          Human review queue
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Explicit requests to speak with a person and STOP replies found in
          signed, tenant-bound WhatsApp events. These are review candidates,
          not active assignments, confirmed opt-outs, or authorized responses.
        </p>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <Link href="/automation/whatsapp/inbound-shadow" className="font-semibold text-violet-700 underline underline-offset-2">
            Back to inbound diagnostics
          </Link>
          <Link href="/automation/approvals" className="font-semibold text-violet-700 underline underline-offset-2">
            Existing send approvals
          </Link>
        </div>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Evidence: {queue.status.replaceAll('_', ' ')}
        </div>
        <p className="mt-2 text-sm text-slate-600">
          Last checked: {queue.checkedAt}. Exact signed provider message,
          business sender account, customer identity and existing CRM message
          must all agree before a lead link is shown.
        </p>
        {queue.status === 'disabled' ? (
          <p role="status" className="mt-4 text-sm text-amber-800">
            The inbound shadow is OFF. Enable only in an authorized staging
            environment to collect new review candidates.
          </p>
        ) : queue.status !== 'ready' ? (
          <p role="status" className="mt-4 text-sm text-amber-800">
            The 7-day report is unavailable or exceeds 1,000 webhook events.
            This is not an empty queue or evidence of successful processing.
          </p>
        ) : (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-200 p-4">
                <p className="text-xs text-slate-500">Review candidates observed in the last 7 days</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-slate-950">
                  {queue.candidateCount?.toLocaleString('en-IN') ?? 'Unavailable'}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 p-4">
                <p className="text-xs text-slate-500">Most recent candidates displayed</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-slate-950">
                  {queue.displayedCount.toLocaleString('en-IN')}
                </p>
              </div>
            </div>

            {queue.rows.length ? (
              <div className="mt-5 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                      <th className="px-3 py-3">Reason</th>
                      <th className="px-3 py-3">Observed (UTC)</th>
                      <th className="px-3 py-3">Identity evidence</th>
                      <th className="px-3 py-3">Staff action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {queue.rows.map((row, i) => (
                      <tr key={i} className="border-b border-slate-100 last:border-0">
                        <td className="px-3 py-3 font-semibold text-slate-800">
                          {row.kind === 'human_request' ? 'Human requested' : 'STOP / opt-out review'}
                        </td>
                        <td className="px-3 py-3 text-slate-600">{row.observedAt}</td>
                        <td className="px-3 py-3 text-slate-600">
                          {row.match === 'verified_identity' ? 'Matched to existing lead' : 'Identity review needed'}
                        </td>
                        <td className="px-3 py-3">
                          {row.match === 'verified_identity' && row.leadId ? (
                            <Link
                              href={`/leads/${encodeURIComponent(row.leadId)}`}
                              className="font-semibold text-violet-700 underline underline-offset-2"
                            >
                              Review lead
                            </Link>
                          ) : (
                            <span className="text-slate-500">Use existing inbox reconciliation</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-5 text-sm text-slate-500">
                No review candidates were observed in the bounded window. This
                is not proof of complete provider or CRM history coverage.
              </p>
            )}
            <p className="mt-4 text-xs leading-5 text-slate-500">
              Displays at most the 40 most recent candidates; the total count
              covers the bounded 7-day snapshot only. Reviewing does not
              update suppression, assign a task, silence AI, claim a queue job
              or send a WhatsApp message.
            </p>
          </>
        )}
      </section>
    </main>
  );
}
