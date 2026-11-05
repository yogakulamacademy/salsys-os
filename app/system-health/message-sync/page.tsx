import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, RefreshCw, ShieldCheck } from 'lucide-react';

import { getCurrentMessageSyncAudit } from '@/lib/message-sync-audit';
import { InstagramEchoVerification } from '@/components/instagram-echo-verification';
import { InstagramHistoryPreview } from '@/components/instagram-history-preview';
import { getCurrentWhatsAppCoexistenceReadiness } from '@/lib/whatsapp-coexistence-readiness';

export const dynamic = 'force-dynamic';

function formatTime(value: string | null): string {
  if (!value) return 'Not recorded';
  const t = new Date(value);
  return Number.isNaN(t.getTime()) ? 'Not recorded'
    : new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(t) + ' UTC';
}

export default async function MessageSyncAuditPage() {
  const result = await getCurrentMessageSyncAudit();
  if (!result) redirect('/dashboard');

  const whatsappReadiness = await getCurrentWhatsAppCoexistenceReadiness();
  if (!whatsappReadiness) redirect('/dashboard');

  const { audit, workspaceName, instagramEchoEnabled, instagramHistoryEnabled, instagramConnections } = result;
  const outbound = audit.messages.filter(row => row.direction === 'outbound');
  const stored = audit.messages.reduce((sum, row) => sum + row.storedCount, 0);
  const totalOutbound = outbound.reduce((sum, row) => sum + row.storedCount, 0);
  const missingProvider = outbound.reduce((sum, row) => sum + row.missingProviderId, 0);
  const unresolved = audit.providerEventLifecycle
    .filter(row => ['failed','dead_letter'].includes(row.status))
    .reduce((sum, row) => sum + row.eventCount, 0);

  return (
    <main className="mx-auto w-full max-w-6xl space-y-5 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/system-health" className="inline-flex items-center gap-2 text-xs font-medium text-copy-muted hover:text-copy">
          <ArrowLeft size={14} aria-hidden /> Back to system health
        </Link>
        <Link href="/system-health/message-sync" className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-xs font-semibold text-copy">
          <RefreshCw size={13} aria-hidden /> Refresh audit
        </Link>
      </div>

      <header>
        <p className="text-xs font-medium uppercase tracking-wider text-copy-muted">Read-only operational evidence</p>
        <h1 className="mt-2 text-2xl font-semibold text-copy">Message synchronization</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-copy-muted">
          Stored conversation messages, webhook processing outcomes and Instagram history-import progress.
          These counts describe CRM records—not verified provider delivery or complete historical coverage.
        </p>
        <p className="mt-2 text-xs text-copy-muted">{workspaceName} · Checked {formatTime(audit.checkedAt)}</p>
      </header>

      <section aria-label="Synchronization overview" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: 'Stored messages', value: stored, detail: 'All tracked channels' },
          { label: 'Outbound in CRM', value: totalOutbound, detail: 'Not necessarily provider-verified' },
          { label: 'Outbound missing provider ID', value: missingProvider, detail: 'Review candidates, not delivery failures' },
          { label: 'Failed / dead-letter events', value: unresolved, detail: 'Recorded webhook processing states' },
        ].map(item => (
          <div key={item.label} className="rounded-xl border border-line bg-surface p-4">
            <p className="text-xs font-medium text-copy-muted">{item.label}</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-copy">{item.value.toLocaleString()}</p>
            <p className="mt-1 text-xs leading-5 text-copy-muted">{item.detail}</p>
          </div>
        ))}
      </section>

      <section className="overflow-hidden rounded-xl border border-line bg-surface">
        <div className="border-b border-line p-4">
          <h2 className="text-sm font-semibold text-copy">CRM message inventory</h2>
          <p className="mt-1 text-xs text-copy-muted">Counts include the entire tenant, not only the current Inbox page. No message bodies are queried.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-xs">
            <thead className="bg-surface-soft text-copy-muted">
              <tr>
                <th className="px-4 py-3 font-semibold">Channel</th>
                <th className="px-4 py-3 font-semibold">Direction</th>
                <th className="px-4 py-3 text-right font-semibold">Messages</th>
                <th className="px-4 py-3 text-right font-semibold">Missing provider ID</th>
                <th className="px-4 py-3 text-right font-semibold">Missing sent time</th>
                <th className="px-4 py-3 font-semibold">Latest stored</th>
              </tr>
            </thead>
            <tbody>
              {audit.messages.map(row => (
                <tr key={row.channel + ':' + row.direction} className="border-t border-line text-copy">
                  <td className="px-4 py-3 capitalize">{row.channel}</td>
                  <td className="px-4 py-3 capitalize">{row.direction}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{row.storedCount.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{row.missingProviderId.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{row.outboundMissingSentAt.toLocaleString()}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{formatTime(row.latestStoredAt)}</td>
                </tr>
              ))}
              {audit.messages.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-copy-muted">No stored messages for this workspace.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-line bg-surface">
        <div className="border-b border-line p-4">
          <h2 className="text-sm font-semibold text-copy">Webhook processing outcomes</h2>
          <p className="mt-1 text-xs leading-5 text-copy-muted">
            Event lifecycle counts are not one-to-one with CRM messages. Failures require a separate
            provider/account review before any retry; this page cannot replay events.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[510px] text-left text-xs">
            <thead className="bg-surface-soft text-copy-muted">
              <tr>
                <th className="px-4 py-3 font-semibold">Channel</th>
                <th className="px-4 py-3 font-semibold">Processing status</th>
                <th className="px-4 py-3 text-right font-semibold">Events</th>
                <th className="px-4 py-3 font-semibold">Last updated</th>
              </tr>
            </thead>
            <tbody>
              {audit.providerEventLifecycle.map(row => (
                <tr key={row.channel + ':' + row.status} className="border-t border-line text-copy">
                  <td className="px-4 py-3 capitalize">{row.channel}</td>
                  <td className="px-4 py-3 capitalize">{row.status.replaceAll('_', ' ')}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{row.eventCount.toLocaleString()}</td>
                  <td className="px-4 py-3">{formatTime(row.lastUpdatedAt)}</td>
                </tr>
              ))}
              {audit.providerEventLifecycle.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-copy-muted">No Instagram or WhatsApp lifecycle records were found.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-line bg-surface p-4">
          <h2 className="text-sm font-semibold text-copy">Instagram outgoing echoes</h2>
          <p className="mt-2 text-sm text-copy">{instagramEchoEnabled ? 'Application parser is enabled' : 'Application parser is disabled'}</p>
          <p className="mt-2 text-xs leading-5 text-copy-muted">
            This flag does not prove that Meta subscribed the account to message_echoes.
            Verify webhook subscription with the existing read-only integration check before accepting native-app replies as synchronized.
          </p>
          <InstagramEchoVerification connections={instagramConnections} />
          <Link href="/settings/integrations" className="mt-3 inline-block text-xs font-semibold text-copy underline underline-offset-2">Integration settings</Link>
        </div>
        <div className="rounded-xl border border-line bg-surface p-4">
          <h2 className="text-sm font-semibold text-copy">Instagram history reconciliation</h2>
          <p className="mt-2 text-sm text-copy">{instagramHistoryEnabled ? 'Import worker flag enabled' : 'Import worker flag disabled'}</p>
          <p className="mt-2 text-xs leading-5 text-copy-muted">
            {audit.instagramHistory.accountCursors} cursor(s) · {audit.instagramHistory.completedCycles} completed cycle(s) ·
            {' '}{audit.instagramHistory.conversationsScanned} conversations scanned · {audit.instagramHistory.messagesImported} imported ·
            {' '}{audit.instagramHistory.messagesAlreadyPresent} already present.
          </p>
          <p className="mt-2 text-xs text-copy-muted">Last scan: {formatTime(audit.instagramHistory.lastScannedAt)}</p>
          <p className="mt-2 text-xs leading-5 text-copy-muted">A missing cursor is unknown history coverage, not proof that all older conversations are present.</p>
          <p className="mt-2 text-xs leading-5 text-copy-muted">Check up to one provider conversation and 20 messages per account without importing anything.</p>
          <InstagramHistoryPreview connections={instagramConnections} />
        </div>
      </section>

      <section aria-label="WhatsApp coexistence readiness" className="rounded-xl border border-line bg-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-copy">WhatsApp Business-app coexistence</h2>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-copy-muted">
              Read-only tenant evidence from linked senders, recorded onboarding metadata and signed webhook receipts.
              This is not proof of provider delivery, phone-app coexistence or complete message history.
            </p>
          </div>
          <Link href="/settings/integrations/whatsapp" className="text-xs font-semibold text-copy underline underline-offset-2">
            WhatsApp settings
          </Link>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: 'Connected integrations', value: whatsappReadiness.connectedAccounts },
            { label: 'Linked active senders', value: whatsappReadiness.linkedActiveSenders },
            { label: 'Signed Business-app echo webhooks', value: whatsappReadiness.signedBusinessAppEchoWebhooks },
            { label: 'Signed echo child events', value: whatsappReadiness.signedBusinessAppEchoChildren },
            { label: 'Webhook events marked failed', value: whatsappReadiness.failedWebhookEvents },
            { label: 'Dead-letter webhook events', value: whatsappReadiness.deadLetterWebhookEvents },
          ].map(item => (
            <div key={item.label} className="rounded-lg border border-line p-3">
              <dt className="text-xs text-copy-muted">{item.label}</dt>
              <dd className="mt-2 text-xl font-semibold tabular-nums text-copy">{item.value.toLocaleString()}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs leading-5 text-copy-muted">
          Recorded onboarding: {whatsappReadiness.recordedCoexistenceAccounts} coexistence,
          {' '}{whatsappReadiness.recordedCloudApiAccounts} Cloud API,
          {' '}{whatsappReadiness.unknownOnboardingAccounts} unknown.
          These are connection metadata claims, not independently checked Meta phone settings.
        </p>
        <p className="mt-2 text-xs leading-5 text-copy-muted">
          Zero echo records means none observed in stored webhooks, not that the WhatsApp Business app
          cannot synchronize. Failed events need authorized investigation; this page cannot display,
          replay, delete or modify them.
        </p>
        <div className="mt-4 rounded-lg border border-line p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-semibold text-copy">Failed-webhook triage</h3>
            <p className="text-xs text-copy-muted">
              {whatsappReadiness.failedLast7Days} failed event(s) received in the last 7 days
            </p>
          </div>
          {whatsappReadiness.failedWebhookEvents === 0 ? (
            <p className="mt-2 text-xs leading-5 text-copy-muted">
              No currently failed legacy WhatsApp webhook records were observed for this workspace.
            </p>
          ) : (
            <>
              <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {[
                  { label: 'Incoming text', count: whatsappReadiness.failedIncomingText },
                  { label: 'Incoming images', count: whatsappReadiness.failedIncomingImages },
                  { label: 'Unsupported messages', count: whatsappReadiness.failedUnsupportedMessages },
                  { label: 'Sent / delivered statuses', count: whatsappReadiness.failedDeliveryStatuses },
                  { label: 'Other event types', count: whatsappReadiness.failedOtherTypes },
                ].map(item => (
                  <div key={item.label} className="rounded-md border border-line px-3 py-2">
                    <dt className="text-xs text-copy-muted">{item.label}</dt>
                    <dd className="mt-1 text-base font-semibold tabular-nums text-copy">{item.count.toLocaleString()}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 text-xs leading-5 text-copy-muted">
                Event categories do not identify the cause of failure. These counts cannot prove
                whether a customer message is missing from the CRM or whether a provider retry
                would be safe. Review the failures privately before any manual recovery.
              </p>
            </>
          )}
        </div>
        <div className="mt-4 rounded-lg border border-line p-3" aria-label="WhatsApp receipt reconciliation">
          <h3 className="text-xs font-semibold text-copy">Receipt-to-CRM reconciliation</h3>
          <p className="mt-1 text-xs leading-5 text-copy-muted">
            Provider message-ID matches must also agree with the incoming WhatsApp channel,
            direction, business account and sender thread. Unmatched receipts need investigation;
            they are not proof of missing customer messages or safe to replay.
          </p>
          {whatsappReadiness.receiptReconciliation ? (
            <>
              <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {[
                  { label: 'Processed incoming receipts', value: whatsappReadiness.receiptReconciliation.processedReceipts },
                  { label: 'Processed with CRM message', value: whatsappReadiness.receiptReconciliation.processedWithMessage },
                  { label: 'Processed without exact match', value: whatsappReadiness.receiptReconciliation.processedWithoutMessage },
                  { label: 'Failed incoming receipts', value: whatsappReadiness.receiptReconciliation.failedReceipts },
                  { label: 'Failed with raw evidence', value: whatsappReadiness.receiptReconciliation.failedWithRawEvidence },
                  { label: 'Failed without exact match', value: whatsappReadiness.receiptReconciliation.failedWithoutMessage },
                ].map(item => (
                  <div key={item.label} className="rounded-md border border-line px-3 py-2">
                    <dt className="text-xs text-copy-muted">{item.label}</dt>
                    <dd className="mt-1 text-base font-semibold tabular-nums text-copy">
                      {item.value.toLocaleString()}
                    </dd>
                  </div>
                ))}
              </dl>
              <div className="mt-4 border-t border-line pt-3">
                <h4 className="text-xs font-semibold text-copy">
                  Processed receipts without exact matches — identity review
                </h4>
                <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {[
                    { label: 'Canonical raw marked processed', value: whatsappReadiness.receiptReconciliation.processedUnmatchedRawProcessed },
                    { label: 'Same-account sender thread', value: whatsappReadiness.receiptReconciliation.processedUnmatchedSameAccountThread },
                    { label: 'Other / unmapped account thread', value: whatsappReadiness.receiptReconciliation.processedUnmatchedOtherAccountThread },
                    { label: 'Multiple account threads', value: whatsappReadiness.receiptReconciliation.processedUnmatchedMultipleAccountThreads },
                    { label: 'No sender thread found', value: whatsappReadiness.receiptReconciliation.processedUnmatchedNoSenderThread },
                  ].map(item => (
                    <div key={item.label} className="rounded-md border border-line px-3 py-2">
                      <dt className="text-xs text-copy-muted">{item.label}</dt>
                      <dd className="mt-1 text-base font-semibold tabular-nums text-copy">
                        {item.value.toLocaleString()}
                      </dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-3 text-xs leading-5 text-copy-muted">
                  Other or multiple account threads indicate a potential historical identity-mapping
                  issue, not a confirmed cause. Do not reassign contacts, move messages or replay
                  events without privately checking the original provider-account evidence.
                </p>
              </div>
              <p className="mt-3 text-xs leading-5 text-copy-muted">
                Oldest processed receipt without an exact match:
                {' '}{formatTime(whatsappReadiness.receiptReconciliation.oldestProcessedUnmatchedAt)}.
                {' '}Oldest failed receipt without an exact match:
                {' '}{formatTime(whatsappReadiness.receiptReconciliation.oldestFailedUnmatchedAt)}.
              </p>
              <p className="mt-2 text-xs leading-5 text-copy-muted">
                This comparison never reads message bodies. Do not bulk retry, create leads,
                or change receipt status based only on these counts.
              </p>
            </>
          ) : (
            <p className="mt-3 text-xs text-copy-muted">
              Receipt reconciliation unavailable. Existing WhatsApp health counts remain available.
            </p>
          )}
        </div>
        <p className="mt-2 text-xs text-copy-muted">Checked {formatTime(whatsappReadiness.checkedAt)}</p>
      </section>

      <div className="flex items-start gap-2 rounded-xl border border-line p-4 text-xs leading-5 text-copy-muted">
        <ShieldCheck size={16} className="mt-0.5 shrink-0" aria-hidden />
        <p>Owner/admin only. Tenant-bound counts and timestamps; no message content, contact details, raw webhook payloads, access tokens, provider delivery calls, or replay actions are exposed. Provider QA remains a separate human-operated step.</p>
      </div>
    </main>
  );
}
