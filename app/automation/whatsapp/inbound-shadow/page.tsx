import Link from 'next/link';

import { getCurrentDeskcommShadowReadiness } from '@/lib/integrations/deskcomm-shadow-readiness';

export const dynamic = 'force-dynamic';

export default async function WhatsAppIngressShadowPage() {
  const evidence = await getCurrentDeskcommShadowReadiness();
  const summary = evidence.summary;

  return (
    <main className="mx-auto max-w-5xl space-y-5 pb-10">
      <header>
        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
          WhatsApp · inbound integration pilot
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">
          Deskcomm-style inbound shadow evidence
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          A privacy-limited review of signed WhatsApp events that the existing
          SalsysOS webhook already received. The optional shadow boundary
          classifies event families and candidate replies; it does not create
          messages, schedule retries, change consent or send anything.
        </p>
        <Link
          href="/automation/whatsapp"
          className="mt-3 inline-block text-sm font-semibold text-violet-700 underline underline-offset-2"
        >
          Back to WhatsApp operations
        </Link>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-bold text-slate-900">Readiness: {evidence.status.replaceAll('_', ' ')}</h2>
        <p className="mt-2 text-xs leading-5 text-slate-600">
          Observed at {evidence.checkedAt}. The report covers up to 1,000
          canonical WhatsApp webhook rows received in the past {evidence.windowDays} days.
          It is unavailable if the bound is exceeded or any tagged record is invalid.
        </p>

        {evidence.status === 'disabled' ? (
          <p role="status" className="mt-4 text-sm text-amber-800">
            Shadow classification is off. To evaluate it in staging, an operator
            may set SALSYS_DESKCOMM_INBOUND_SHADOW=true in server configuration.
            No historical data is backfilled and no provider configuration is changed.
          </p>
        ) : evidence.status !== 'ready' || !summary ? (
          <p role="status" className="mt-4 text-sm text-amber-800">
            This evidence is unavailable. No completeness or zero-failure
            claim is being made. Existing Meta webhook processing is unaffected.
          </p>
        ) : (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: 'Raw receipts in window', value: summary.observedRawReceipts },
                { label: 'Shadow-tagged receipts', value: summary.taggedReceipts },
                { label: 'Untagged receipts', value: summary.untaggedReceipts },
                { label: 'Inbound messages', value: summary.inboundMessages },
                { label: 'Delivery statuses', value: summary.deliveryStatuses },
                { label: 'Other / untrusted events', value: summary.unsupportedEvents },
                { label: 'Incomplete evidence', value: summary.incompleteEvidence },
                { label: 'Untrusted evidence', value: summary.untrustedEvidence },
              ].map((item) => (
                <div key={item.label} className="rounded-xl border border-slate-200 p-3">
                  <p className="text-xs text-slate-500">{item.label}</p>
                  <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900">
                    {item.value.toLocaleString('en-IN')}
                  </p>
                </div>
              ))}
            </div>

            <h3 className="mt-6 text-sm font-bold text-slate-900">
              Unconfirmed reply intent candidates
            </h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {[
                { label: 'DATES reply', value: summary.candidateBatchDates },
                { label: 'Month reply', value: summary.candidateMonths },
                { label: 'STOP reply', value: summary.candidateOptOuts },
              ].map((item) => (
                <div key={item.label} className="rounded-xl border border-slate-200 p-3">
                  <p className="text-xs text-slate-500">{item.label}</p>
                  <p className="mt-2 text-xl font-bold tabular-nums text-slate-900">
                    {item.value.toLocaleString('en-IN')}
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-500">
              These are candidates only, not intent confirmations. A reply may
              require template context and operator review. They do not update
              contact preferences or authorize automated messaging.
            </p>
            {summary.lastTaggedAt ? (
              <p className="mt-3 text-xs text-slate-500">
                Latest tagged receipt: {summary.lastTaggedAt}
              </p>
            ) : (
              <p className="mt-3 text-xs text-slate-500">
                No tagged receipts observed in this window. This is not proof
                of missing provider messages.
              </p>
            )}
          </>
        )}
      </section>

      <p className="text-xs leading-5 text-slate-500">
        Inspired by DeskcommCRM's provider-specific channel boundary. The
        official Meta Cloud API remains the only WhatsApp send path in SalsysOS.
        No WAHA QR sessions or second CRM installation are activated.
      </p>
    </main>
  );
}
