import Link from 'next/link';

import { getUnknownWhatsAppSendReview } from '@/lib/integrations/whatsapp-unknown-send-review';

export const dynamic = 'force-dynamic';

function utc(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp)
    ? new Date(timestamp).toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
    : 'Time unavailable';
}

export default async function WhatsAppUncertainSendReviewPage() {
  const review = await getUnknownWhatsAppSendReview();

  return (
    <main className="mx-auto max-w-5xl space-y-5 pb-10">
      <header>
        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
          WhatsApp · provider audit · owner/admin
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">
          Uncertain send outcomes
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Meta may have accepted a message even if the network request timed out.
          These audits need independent evidence before any decision about retry
          or reconciliation. This page cannot send messages, change audit state,
          or release a human-handoff hold.
        </p>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <Link href="/automation/whatsapp/human-review" className="font-semibold text-violet-700 underline underline-offset-2">
            Human review
          </Link>
          <Link href="/automation/whatsapp" className="font-semibold text-violet-700 underline underline-offset-2">
            WhatsApp operations
          </Link>
        </div>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Investigation queue · all available audit history
            </div>
            <div className="mt-1 text-xs text-slate-500">
              Observed {utc(review.checkedAt)} · oldest unresolved first
            </div>
          </div>
          <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700">
            {review.status === 'ready' ? `${review.rows.length}${review.hasMore ? '+' : ''} shown` : 'Unavailable'}
          </div>
        </div>

        {review.status !== 'ready' ? (
          <p role="alert" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            Provider audit evidence could not be loaded. Do not interpret this
            as zero uncertain sends. Check database access and retry later.
          </p>
        ) : review.rows.length === 0 ? (
          <p role="status" className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            No matching outcome-unknown audits were found in retained audit history.
            This does not prove all external provider sends succeeded or that no older audit evidence was deleted.
          </p>
        ) : (
          <>
            {review.hasMore ? (
              <p role="status" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                More than 50 matching audits exist in retained history.
                The list is bounded; investigate the oldest items first.
                This is not an exact total.
              </p>
            ) : null}
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                    <th className="px-3 py-3">Audit reference</th>
                    <th className="px-3 py-3">Attempt started</th>
                    <th className="px-3 py-3">Last recorded</th>
                    <th className="px-3 py-3">CRM record</th>
                  </tr>
                </thead>
                <tbody>
                  {review.rows.map((row) => (
                    <tr key={row.auditId} className="border-b border-slate-100 last:border-0">
                      <td className="max-w-[220px] break-all px-3 py-3 font-mono text-xs text-slate-700">
                        <code className="select-all">{row.auditId}</code>
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-600">{utc(row.createdAt)}</td>
                      <td className="px-3 py-3 text-xs text-slate-600">{utc(row.updatedAt)}</td>
                      <td className="px-3 py-3">
                        <Link href={`/leads/${encodeURIComponent(row.leadId)}`}
                          className="font-semibold text-violet-700 underline underline-offset-2">
                          Review lead
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-bold text-slate-950">Before making any delivery decision</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-slate-600">
          <li>Use independent Meta/provider acceptance evidence for the exact attempt. A missing receipt is not a rejection.</li>
          <li>Check the canonical CRM message identity, tenant, sender and relevant status webhooks without making another send.</li>
          <li>Escalate ambiguous attempts for a reviewed reconciliation; never convert an unknown outcome to failed/ready just to retry it.</li>
        </ol>
        <p className="mt-3 text-xs text-amber-800">
          Read-only view: bounded to 50 shown audits and the retention of available evidence.
          It does not prove the database retry-blocking migration is installed.
          The Meta staging acceptance and operator approval gates remain open.
        </p>
      </section>
    </main>
  );
}
