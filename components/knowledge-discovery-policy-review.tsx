'use client';

import { useCallback, useEffect, useState } from 'react';
import { FileCheck2, RefreshCcw, ShieldAlert } from 'lucide-react';

type Policy = {
  policyVersion: string;
  policySha256: string;
  policyText: string;
  sourceReference: string;
  recordedAt: string;
  registryRecordedAt: string;
};
type PolicyStatus = 'loading' | 'disabled' | 'unavailable' | 'ready' | 'error';

const SHA = /^[a-f0-9]{64}$/;
function validPolicy(payload: Record<string, unknown>): payload is Record<string, unknown> & Policy {
  return typeof payload.policyVersion === 'string' && payload.policyVersion.length > 0 &&
    payload.policyVersion.length <= 100 &&
    typeof payload.policySha256 === 'string' && SHA.test(payload.policySha256) &&
    typeof payload.policyText === 'string' && payload.policyText.length >= 40 &&
    payload.policyText.length <= 16000 &&
    typeof payload.sourceReference === 'string' && payload.sourceReference.length > 0 &&
    payload.sourceReference.length <= 500 &&
    typeof payload.recordedAt === 'string' && Number.isFinite(Date.parse(payload.recordedAt)) &&
    typeof payload.registryRecordedAt === 'string' && Number.isFinite(Date.parse(payload.registryRecordedAt));
}
function utc(value: string) {
  return new Date(value).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
  }) + ' UTC';
}

/** Plain-text only. The server independently verifies the SHA against the exact UTF-8 policy. */
export function KnowledgeDiscoveryPolicyReview() {
  const [status, setStatus] = useState<PolicyStatus>('loading');
  const [policy, setPolicy] = useState<Policy | null>(null);

  const load = useCallback(async () => {
    setStatus('loading');
    setPolicy(null);
    try {
      const res = await fetch('/api/knowledge/discovery/policy', {
        method: 'GET', credentials: 'same-origin', cache: 'no-store',
      });
      const payload = await res.json();
      if (!res.ok || payload?.ok !== true) throw new Error('Policy state could not be verified');
      if (payload.reviewEnabled !== true) {
        setStatus('disabled');
        return;
      }
      if (payload.available !== true) {
        setStatus('unavailable');
        return;
      }
      if (typeof payload !== 'object' || !validPolicy(payload))
        throw new Error('Policy response is malformed');
      setPolicy(payload);
      setStatus('ready');
    } catch {
      setPolicy(null);
      setStatus('error');
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return (
    <section aria-label="Policy document review" className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <FileCheck2 size={17} aria-hidden="true" />
          <h2 className="text-sm font-semibold">Policy document for review</h2>
        </div>
        <button type="button" disabled={status === 'loading'}
          onClick={() => { void load(); }}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold disabled:opacity-40">
          <RefreshCcw size={13} aria-hidden="true" /> Refresh policy
        </button>
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-600">
        A document must be operator-registered with a matching SHA-256 fingerprint
        before it can be displayed. The document's presence is not proof of an
        independent legal review, consent, or authorization to scan a website.
      </p>

      {status === 'loading' ? (
        <p className="mt-4 text-sm text-slate-500">Checking policy document availability…</p>
      ) : null}
      {status === 'disabled' ? (
        <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
          Policy document review is disabled in this environment. No approved notice is assumed.
        </p>
      ) : null}
      {status === 'unavailable' ? (
        <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
          No digest-matched policy document is registered for review. Consent granting remains unavailable.
        </p>
      ) : null}
      {status === 'error' ? (
        <p role="alert" className="mt-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
          <ShieldAlert size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
          Policy document could not be verified. Do not rely on an earlier policy or proceed with a grant.
        </p>
      ) : null}
      {status === 'ready' && policy ? (
        <div className="mt-4 space-y-4">
          <dl className="grid gap-3 rounded-lg border border-slate-100 bg-slate-50 p-4 text-xs sm:grid-cols-2">
            <div><dt className="text-slate-500">Registered policy version</dt>
              <dd className="mt-1 break-all font-semibold">{policy.policyVersion}</dd></div>
            <div><dt className="text-slate-500">Operator-provided source reference</dt>
              <dd className="mt-1 break-all font-medium">{policy.sourceReference}</dd></div>
            <div><dt className="text-slate-500">Document registered</dt>
              <dd className="mt-1 font-medium">{utc(policy.recordedAt)}</dd></div>
            <div><dt className="text-slate-500">Registry recorded</dt>
              <dd className="mt-1 font-medium">{utc(policy.registryRecordedAt)}</dd></div>
            <div className="sm:col-span-2"><dt className="text-slate-500">Verified UTF-8 SHA-256</dt>
              <dd className="mt-1 break-all font-mono text-[11px]">{policy.policySha256}</dd></div>
          </dl>
          <div role="region" aria-label="Exact registered policy text"
            className="max-h-[480px] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-slate-200 p-4 text-sm leading-6 text-slate-800">
            {policy.policyText}
          </div>
          <p className="text-xs text-amber-800">
            Read-only review. No acknowledgement is saved, no consent grant can be
            submitted here, and no retention or legal acceptance is inferred.
          </p>
        </div>
      ) : null}
    </section>
  );
}
