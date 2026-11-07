'use client';

import Link from 'next/link';
import { KnowledgeDiscoveryPolicyReview } from '@/components/knowledge-discovery-policy-review';
import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle, ArrowLeft, Ban, Clock3, LockKeyhole,
  RefreshCcw, ScrollText, ShieldCheck,
} from 'lucide-react';

type ConsentRecord = {
  hostname: string;
  purpose: 'website_discovery_review_only';
  status: 'granted' | 'withdrawn';
  policy_version: string;
  granted_at: string;
  valid_until: string;
  withdrawn_at: string | null;
  revision: number;
};
type ConsentAudit = {
  hostname: string;
  action: 'granted' | 'withdrawn';
  revision: number;
  occurred_at: string;
  policy_version: string;
  job_cancellations: number;
};
type ReadState = 'loading' | 'disabled' | 'ready' | 'error';

const exactHost = /^[a-z0-9][a-z0-9.-]*[.][a-z]{2,}$/;
function isRecord(value: unknown): value is ConsentRecord {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return typeof row.hostname === 'string' && row.hostname.length <= 253 &&
    exactHost.test(row.hostname) && row.purpose === 'website_discovery_review_only' &&
    (row.status === 'granted' || row.status === 'withdrawn') &&
    typeof row.policy_version === 'string' &&
    typeof row.granted_at === 'string' && typeof row.valid_until === 'string' &&
    (row.withdrawn_at === null || typeof row.withdrawn_at === 'string') &&
    Number.isSafeInteger(row.revision) && (row.revision as number) >= 1;
}
function isAudit(value: unknown): value is ConsentAudit {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return typeof row.hostname === 'string' && row.hostname.length <= 253 &&
    exactHost.test(row.hostname) &&
    (row.action === 'granted' || row.action === 'withdrawn') &&
    Number.isSafeInteger(row.revision) && (row.revision as number) >= 1 &&
    typeof row.occurred_at === 'string' &&
    typeof row.policy_version === 'string' &&
    Number.isSafeInteger(row.job_cancellations) &&
    (row.job_cancellations as number) >= 0;
}
function utc(value: string | null) {
  if (!value) return 'Not recorded';
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return 'Invalid recorded date';
  return new Date(time).toLocaleString('en-GB', {
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
  }) + ' UTC';
}

/**
 * KB-06D: genuine read-only consent status, and exact-revision withdrawal.
 * There is deliberately NO consent-grant POST or erasure request in this UI.
 * A reviewed policy document / legal notice presentation does not exist yet.
 */
export function KnowledgeDiscoveryConsentWorkspace() {
  const [readState, setReadState] = useState<ReadState>('loading');
  const [records, setRecords] = useState<ConsentRecord[]>([]);
  const [audit, setAudit] = useState<ConsentAudit[]>([]);
  const [readError, setReadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState<{ hostname: string; revision: number } | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);

  const load = useCallback(async () => {
    setReadState('loading');
    setReadError('');
    setRecords([]);
    setAudit([]);
    setSelected(null);
    setConfirmation('');
    try {
      const response = await fetch('/api/knowledge/discovery/consent', {
        method: 'GET', cache: 'no-store', credentials: 'same-origin',
      });
      const payload = await response.json();
      if (!response.ok || payload?.ok !== true) {
        throw new Error('The consent state could not be verified for this workspace.');
      }
      if (payload.readEnabled !== true && payload.managementEnabled !== true) {
        setReadState('disabled');
        return;
      }
      if (!Array.isArray(payload.records) || !Array.isArray(payload.audit) ||
          !payload.records.every(isRecord) || !payload.audit.every(isAudit)) {
        throw new Error('The consent record response was incomplete or invalid.');
      }
      setRecords(payload.records);
      setAudit(payload.audit);
      setReadState('ready');
    } catch (error) {
      setReadError(error instanceof Error ? error.message : 'Unable to read consent state.');
      setReadState('error');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function reviewWithdrawal(record: ConsentRecord) {
    if (readState !== 'ready' || withdrawing || record.status !== 'granted') return;
    setActionError('');
    setNotice('');
    setConfirmation('');
    setSelected({ hostname: record.hostname, revision: record.revision });
  }
  function cancelWithdrawal() {
    if (withdrawing) return;
    setSelected(null);
    setConfirmation('');
    setActionError('');
  }
  async function withdraw() {
    if (readState !== 'ready' || withdrawing || !selected ||
        confirmation !== selected.hostname ||
        !records.some(record => record.hostname === selected.hostname &&
          record.revision === selected.revision && record.status === 'granted')) return;

    setWithdrawing(true);
    setActionError('');
    setNotice('');
    try {
      const response = await fetch('/api/knowledge/discovery/consent', {
        method: 'DELETE',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          hostname: selected.hostname,
          expectedRevision: selected.revision,
        }),
      });
      const payload = await response.json();
      if (!response.ok || payload?.ok !== true || payload.status !== 'withdrawn') {
        throw new Error(response.status === 409
          ? 'This consent has changed or was already withdrawn. Refresh and review its current state.'
          : 'Withdrawal was not confirmed by the server. No success is assumed.');
      }
      const cancelled = Number.isSafeInteger(payload.jobsCancelled) && payload.jobsCancelled >= 0
        ? payload.jobsCancelled : null;
      setNotice('Consent withdrawal confirmed by the database.' +
        (cancelled === null ? '' : ' Discovery jobs cancelled: ' + cancelled + '.') +
        ' This does not erase historical discovery page metadata or knowledge.');
      await load();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Withdrawal could not be confirmed.');
      // Do not pretend an unsuccessful/ambiguous request withdrew consent.
      setSelected(null);
      setConfirmation('');
      await load();
    } finally {
      setWithdrawing(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-5 py-7 text-slate-800 sm:px-8"
      aria-label="Discovery consent management">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/settings/knowledge/discovery"
            className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800">
            <ArrowLeft aria-hidden="true" size={13} /> Website discovery
          </Link>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">Discovery consent</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Review consent recorded for your organization’s verified website, including
            its purpose, expiry and withdrawal history.
          </p>
        </div>
        <button type="button" onClick={() => { setNotice(''); setActionError(''); void load(); }}
          disabled={readState === 'loading' || withdrawing}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold disabled:opacity-40">
          <RefreshCcw size={14} aria-hidden="true" /> Refresh
        </button>
      </header>

      <section aria-label="Consent limitations"
        className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-start gap-3">
          <LockKeyhole size={19} aria-hidden="true" className="mt-0.5 shrink-0 text-slate-600" />
          <div className="space-y-2">
            <h2 className="text-sm font-semibold">New consent grants are unavailable</h2>
            <p className="text-xs leading-5 text-slate-600">
              An independently approved policy document and the owner-facing legal notice
              are required before a new grant can be offered. Website ownership verification
              alone does not authorize crawling. No policy approval, scan, evidence storage,
              AI generation or publishing occurs on this page.
            </p>
            <button type="button" disabled
              className="rounded-lg bg-slate-200 px-3 py-2 text-xs font-semibold text-slate-500">
              Grant consent unavailable
            </button>
          </div>
        </div>
      </section>

      <KnowledgeDiscoveryPolicyReview />

      {notice ? <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{notice}</p> : null}
      {actionError ? <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{actionError}</p> : null}

      <section className="rounded-xl border border-slate-200 bg-white p-5" aria-label="Consent records">
        <div className="flex items-center gap-2">
          <ShieldCheck size={17} aria-hidden="true" />
          <h2 className="text-sm font-semibold">Recorded consent</h2>
        </div>
        {readState === 'loading' ? <p className="mt-5 text-sm text-slate-500">Checking permission and consent records…</p> : null}
        {readState === 'disabled' ? (
          <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
            Consent history is not available in this environment. This is not confirmation
            that no consent exists. Authorized staging must explicitly enable read-only
            access after the database schema is approved.
          </p>
        ) : null}
        {readState === 'error' ? (
          <div role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            {readError} No consent status is assumed. Use Refresh to retry.
          </div>
        ) : null}
        {readState === 'ready' && records.length === 0 ? (
          <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
            No discovery consent records were returned for this organization. This does
            not authorize a new scan.
          </p>
        ) : null}
        {readState === 'ready' ? (
          <div className="mt-4 space-y-4">
            {records.map((record) => {
              const expired = Date.parse(record.valid_until) <= Date.now();
              const reviewing = selected?.hostname === record.hostname &&
                selected?.revision === record.revision;
              return (
                <article key={record.hostname} aria-label={'Consent for ' + record.hostname}
                  className="min-w-0 rounded-lg border border-slate-200 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="min-w-0 break-all text-sm font-semibold">{record.hostname}</h3>
                    <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium">
                      {record.status === 'withdrawn' ? 'Withdrawn' :
                        expired ? 'Granted, expired' : 'Granted, time-limited'}
                    </span>
                  </div>
                  <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
                    <div><dt className="text-slate-500">Purpose</dt><dd className="mt-1 break-words font-medium">Read-only website discovery review</dd></div>
                    <div><dt className="text-slate-500">Revision</dt><dd className="mt-1 font-medium tabular-nums">{record.revision}</dd></div>
                    <div><dt className="text-slate-500">Policy version recorded</dt><dd className="mt-1 break-all font-medium">{record.policy_version}</dd></div>
                    <div><dt className="text-slate-500">Granted at</dt><dd className="mt-1 font-medium">{utc(record.granted_at)}</dd></div>
                    <div><dt className="text-slate-500">Valid until</dt><dd className="mt-1 font-medium">{utc(record.valid_until)}</dd></div>
                    {record.withdrawn_at ? (
                      <div><dt className="text-slate-500">Withdrawn at</dt><dd className="mt-1 font-medium">{utc(record.withdrawn_at)}</dd></div>
                    ) : null}
                  </dl>
                  {record.status === 'granted' ? (
                    <div className="mt-4 border-t border-slate-100 pt-4">
                      {reviewing ? (
                        <div className="space-y-3" aria-label={'Confirm withdrawal for ' + record.hostname}>
                          <p className="text-xs leading-5 text-slate-600">
                            Withdrawal cancels outstanding discovery jobs and prevents
                            further page commits. It does not erase previous scan metadata
                            or previously stored knowledge. To confirm, type the exact hostname.
                          </p>
                          <label htmlFor="consent-withdraw-host" className="block text-xs font-semibold">
                            Type {record.hostname} to confirm
                          </label>
                          <input id="consent-withdraw-host" type="text" autoComplete="off"
                            spellCheck={false} disabled={withdrawing} value={confirmation}
                            onChange={event => setConfirmation(event.target.value)}
                            className="w-full min-w-0 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-offset-2"
                          />
                          <div className="flex flex-wrap gap-2">
                            <button type="button" disabled={withdrawing} onClick={cancelWithdrawal}
                              className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold disabled:opacity-40">
                              Cancel
                            </button>
                            <button type="button" disabled={withdrawing || confirmation !== record.hostname}
                              onClick={() => void withdraw()}
                              className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40">
                              <Ban size={14} aria-hidden="true" />
                              {withdrawing ? 'Withdrawing…' : 'Withdraw consent'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button type="button" disabled={withdrawing || Boolean(selected)}
                          onClick={() => reviewWithdrawal(record)}
                          className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold disabled:opacity-40">
                          Review withdrawal
                        </button>
                      )}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : null}
      </section>

      <section aria-label="Consent audit trail" className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2">
          <ScrollText size={17} aria-hidden="true" />
          <h2 className="text-sm font-semibold">Consent change history</h2>
        </div>
        <p className="mt-1 text-xs text-slate-500">Recent recorded grant and withdrawal events (up to 50). This is not a legal review or deletion audit.</p>
        {readState === 'ready' ? (
          audit.length === 0 ? <p className="mt-4 text-sm text-slate-500">No consent events returned for this organization.</p> :
          <ol className="mt-4 divide-y divide-slate-100">
            {audit.map((entry, index) => (
              <li key={entry.hostname + entry.revision + entry.action + index} className="flex gap-3 py-3">
                <Clock3 size={15} aria-hidden="true" className="mt-0.5 shrink-0 text-slate-400" />
                <div className="min-w-0 space-y-1 text-xs">
                  <p className="font-semibold">{entry.action === 'granted' ? 'Consent granted' : 'Consent withdrawn'} · <span className="break-all">{entry.hostname}</span></p>
                  <p className="text-slate-500">{utc(entry.occurred_at)} · Revision {entry.revision}</p>
                  <p className="break-all text-slate-500">Policy: {entry.policy_version}</p>
                  {entry.action === 'withdrawn' ? <p className="text-slate-500">Jobs cancelled: {entry.job_cancellations}</p> : null}
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-4 flex items-start gap-2 text-sm text-slate-500">
            <AlertCircle size={15} aria-hidden="true" className="mt-0.5 shrink-0" />
            Audit history is not verified or available in this state.
          </p>
        )}
      </section>

      <p className="text-xs leading-5 text-slate-500">
        <LockKeyhole size={13} aria-hidden="true" className="mr-1 inline" />
        Only authenticated, organization-bound owner/admin sessions can read or
        change consent through the backend. This screen cannot issue consent or
        erase historical discovery metadata.
      </p>
    </main>
  );
}
