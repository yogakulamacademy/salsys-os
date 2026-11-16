import Link from 'next/link';

import { getCurrentDeskcommHumanReviewQueue } from '@/lib/integrations/deskcomm-human-review-data';
import {
  claimDeskcommHumanReviewAction,
  closeDeskcommHumanReviewAction,
  releaseDeskcommHumanReviewHoldAction,
} from '@/app/automation/whatsapp/human-review/actions';

export const dynamic = 'force-dynamic';

export default async function WhatsAppHumanReviewQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const [queue, query] = await Promise.all([
    getCurrentDeskcommHumanReviewQueue(),
    searchParams,
  ]);
  const notices: Record<string, string> = {
    assigned: 'Human review task created and assigned to your CRM account. Active automations were paused; unclaimed scheduled work was cancelled.',
    already_assigned: 'This request already has a handoff task. No duplicate task was created.',
    closed: 'Handoff closed. The AI hold remains until separately released. No cancelled work was resumed.',
    hold_released: 'This handoff hold was released. Other active holds and normal messaging safeguards still apply; cancelled jobs were not replayed.',
    send_in_flight: 'A WhatsApp provider send is already in flight for this lead. No handoff task was created. Reconcile the existing send audit before retrying; do not assume the message was unsent.',
    unavailable: 'The action could not be completed safely. Confirm the migration and exact CRM identity evidence before retrying.',
    invalid: 'Invalid handoff request. Nothing was changed.',
    disabled: 'Handoff task actions are disabled in this environment.',
  };
  const notice = typeof query.status === 'string' ? notices[query.status] : null;
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

      {notice ? (
        <p role="status" className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          {notice}
        </p>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Evidence: {queue.status.replaceAll('_', ' ')}
        </div>
        <p className="mt-2 text-sm text-slate-600">
          Last checked: {queue.checkedAt}. Exact signed provider message,
          business sender account, customer identity and existing CRM message
          must all agree before a lead link is shown.
        </p>
        {queue.status === 'ready' && !queue.actionsEnabled ? (
          <p className="mt-3 text-sm text-slate-500">
            Human handoff task actions are OFF. Candidate review is read-only.
            The existing CRM messaging, suppression and approval controls remain authoritative.
          </p>
        ) : null}

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
                            <div className="flex flex-col items-start gap-2">
                              <Link
                                href={`/leads/${encodeURIComponent(row.leadId)}`}
                                className="font-semibold text-violet-700 underline underline-offset-2"
                              >
                                Review lead
                              </Link>
                              {row.handoff ? (
                                <>
                                  <span className="text-xs text-slate-500">
                                    Handoff {row.handoff.status} · task recorded
                                  </span>
                                  {row.handoff.aiHoldActive ? (
                                    <span className="text-xs font-medium text-amber-800">
                                      Automation hold active
                                    </span>
                                  ) : (
                                    <span className="text-xs text-slate-600">
                                      Hold released · no job replay
                                    </span>
                                  )}
                                  {queue.actionsEnabled && row.handoff.status === 'closed' &&
                                    row.handoff.aiHoldActive ? (
                                    <form action={releaseDeskcommHumanReviewHoldAction}>
                                      <input type="hidden" name="handoff_id" value={row.handoff.id} />
                                      <button
                                        type="submit"
                                        className="rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-950"
                                      >
                                        Release this hold (no replay)
                                      </button>
                                    </form>
                                  ) : null}
                                  {queue.actionsEnabled && row.handoff.status === 'open' ? (
                                    <div className="flex flex-wrap gap-2">
                                      <form action={closeDeskcommHumanReviewAction}>
                                        <input type="hidden" name="handoff_id" value={row.handoff.id} />
                                        <input type="hidden" name="resolution" value="resolved_by_staff" />
                                        <button type="submit" className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold">
                                          Resolve and close
                                        </button>
                                      </form>
                                      <form action={closeDeskcommHumanReviewAction}>
                                        <input type="hidden" name="handoff_id" value={row.handoff.id} />
                                        <input type="hidden" name="resolution" value="dismissed_after_review" />
                                        <button type="submit" className="rounded-lg border border-slate-300 px-2 py-1 text-xs">
                                          Dismiss
                                        </button>
                                      </form>
                                    </div>
                                  ) : null}
                                </>
                              ) : queue.actionsEnabled && row.kind === 'human_request' && row.rawEventId ? (
                                <form action={claimDeskcommHumanReviewAction}>
                                  <input type="hidden" name="raw_event_id" value={row.rawEventId} />
                                  <button type="submit" className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold">
                                    Assign review to me
                                  </button>
                                </form>
                              ) : null}
                            </div>
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
              covers the bounded 7-day snapshot only. Reviewing is read-only.
              With the separate action flag enabled, an explicit administrator
              click can create one assigned human-review task and pause the
              lead's current automation enrollments. This does not alter consent,
              cancel an already-claimed provider send, or send a WhatsApp message.
              Closing a handoff keeps its automation hold in place until
              an authorized administrator separately allows future automation.
              Cancelled jobs are never replayed by this interface.
            </p>
          </>
        )}
      </section>
    </main>
  );
}
