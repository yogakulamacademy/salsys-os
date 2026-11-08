'use client';

import Link from 'next/link';
import { saveKnowledgeWebsiteAction } from '@/app/settings/knowledge/discovery/actions';
import { safeDiscoveryPageLink } from '@/lib/knowledge-discovery/public-page-link';
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Globe2, RefreshCcw, ShieldCheck, Square, Play, AlertCircle } from 'lucide-react';

type Job = {
  id: string;
  seed_url: string;
  status: 'queued' | 'running' | 'completed' | 'partial' | 'failed' | 'cancelled';
  max_pages: number;
  pages_discovered: number;
  pages_fetched: number;
  pages_blocked: number;
  pages_failed: number;
  pages_skipped: number;
  last_error_code: string | null;
  created_at: string;
  finished_at: string | null;
};
type Page = {
  id: string;
  url: string;
  status: string;
  depth: number;
  page_title: string | null;
  http_status: number | null;
  failure_code: string | null;
};
type State = { configuredWebsite: string | null; pilotEnabled: boolean; websiteVerified: boolean; discoveryEnabled: boolean; historyAvailable: boolean; jobs: Job[]; pages: Page[] };
const initial: State = { configuredWebsite: null, pilotEnabled: false, websiteVerified: false, discoveryEnabled: false, historyAvailable: false, jobs: [], pages: [] };

const terminal = new Set(['completed', 'partial', 'failed', 'cancelled']);
const statusText: Record<Job['status'], string> = {
  queued: 'Queued', running: 'Discovering', completed: 'Completed',
  partial: 'Partial coverage', failed: 'Failed', cancelled: 'Cancelled',
};

export function KnowledgeDiscoveryWorkspace({
  canEditWebsite,
  websiteNotice = '',
  websiteError = '',
}: {
  canEditWebsite: boolean;
  websiteNotice?: string;
  websiteError?: string;
}) {
  const [state, setState] = useState<State>(initial);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [pageLimit, setPageLimit] = useState(30);
  const [ownershipToken, setOwnershipToken] = useState('');
  const [verificationStatus, setVerificationStatus] = useState('unverified');
  const [verificationBusy, setVerificationBusy] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const response = await fetch('/api/knowledge/discovery', { cache: 'no-store', credentials: 'same-origin' });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'Could not load website discovery.');
      setState({
        configuredWebsite: payload.configuredWebsite ?? null,
        pilotEnabled: payload.pilotEnabled === true,
        websiteVerified: payload.websiteVerified === true,
        discoveryEnabled: payload.discoveryEnabled === true,
        historyAvailable: payload.historyAvailable === true,
        jobs: Array.isArray(payload.jobs) ? payload.jobs : [],
        pages: Array.isArray(payload.pages) ? payload.pages : [],
      });
      if (payload.pilotEnabled === true && payload.configuredWebsite) {
        const verificationResponse = await fetch('/api/knowledge/discovery/verification', {
          cache: 'no-store', credentials: 'same-origin',
        });
        if (verificationResponse.ok) {
          const proof = await verificationResponse.json();
          setVerificationStatus(proof.status ?? 'unverified');
        }
      }
      setError('');
    } catch (e) {
      if (!silent) setError(e instanceof Error ? e.message : 'Could not load discovery.');
    } finally { if (!silent) setLoading(false); }
  }, []);

  useEffect(() => {
    void load();
    const refresh = setInterval(() => { void load(true); }, 10_000);
    return () => clearInterval(refresh);
  }, [load]);

  const latest = state.jobs[0] ?? null;
  const active = latest && !terminal.has(latest.status);

  async function ownershipAction(action: 'issue' | 'verify') {
    setVerificationBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/knowledge/discovery/verification', {
        method: action === 'issue' ? 'POST' : 'PUT',
        headers: { 'content-type': 'application/json' },
        body: '{}', credentials: 'same-origin', cache: 'no-store',
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error ?? 'Ownership verification failed.');
      if (action === 'issue') {
        setOwnershipToken(result.token);
        setVerificationStatus('pending');
        setMessage('Challenge issued. Publish the token at the specified website path.');
      } else {
        setOwnershipToken('');
        setVerificationStatus('verified');
        setMessage('Website ownership verified. Discovery can now be started.');
        await load(true);
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Ownership verification failed.'); }
    finally { setVerificationBusy(false); }
  }

  async function change(action: 'start' | 'cancel') {
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/knowledge/discovery', {
        method: action === 'start' ? 'POST' : 'DELETE',
        cache: 'no-store', credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(action === 'start'
          ? { url: state.configuredWebsite, maxPages: pageLimit }
          : { jobId: latest?.id }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'Request failed.');
      setMessage(action === 'start' ? 'Discovery queued. No AI knowledge has been published.' : 'Discovery cancelled.');
      await load(true);
    } catch (e) { setError(e instanceof Error ? e.message : 'Request failed.'); }
    finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-5 py-7 text-slate-800 sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/settings/knowledge" className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800">
            <ArrowLeft size={13} /> Organization Knowledge
          </Link>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">Website discovery</h1>
          <Link href="/settings/knowledge/discovery/consent"
            className="mt-2 inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900">
            <ShieldCheck size={14} aria-hidden="true"/> Review discovery consent
          </Link>
          <p className="mt-1 text-sm text-slate-500">Find public pages for review before extracting or generating knowledge.</p>
        </div>
        <button onClick={() => void load()} disabled={loading || busy}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold disabled:opacity-40">
          <RefreshCcw size={14} /> Refresh
        </button>
      </div>

      {websiteError ? <div role="alert" className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800"><AlertCircle size={15}/>{websiteError}</div> : null}
      {websiteNotice ? <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">{websiteNotice}</div> : null}
      {error ? <div role="alert" className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800"><AlertCircle size={15}/>{error}</div> : null}
      {message ? <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">{message}</div> : null}

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(260px,1fr)]">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-5 flex items-center gap-2 text-sm font-semibold"><Globe2 size={17}/> Business website</div>
          <label htmlFor="kb-website" className="text-xs font-medium text-slate-600">Configured organization website</label>
          <input id="kb-website" readOnly value={state.configuredWebsite ?? ''} placeholder={loading ? 'Loading…' : 'Not configured'}
            className="mt-2 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700" />
          {!state.configuredWebsite && !loading ? <p className="mt-2 text-xs text-amber-700">A public HTTPS website is required before discovery can be reviewed or started.</p> : null}
          {canEditWebsite && !loading && !error ? (
            <form action={saveKnowledgeWebsiteAction} className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <label htmlFor="kb-website-update" className="block text-xs font-semibold text-slate-700">
                {state.configuredWebsite ? 'Change website after onboarding' : 'Add website after onboarding'}
              </label>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Only owners and admins can save the configured HTTPS root domain. Saving never runs a scan or changes existing knowledge, approval, proof or consent records.
              </p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input key={state.configuredWebsite ?? 'unconfigured'} id="kb-website-update"
                  name="website" type="url" required maxLength={240}
                  defaultValue={state.configuredWebsite ?? ''}
                  placeholder="https://yourbusiness.com/"
                  className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-800"/>
                <button type="submit" disabled={busy || verificationBusy}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-800 disabled:opacity-40">
                  Save website
                </button>
              </div>
              <p className="mt-2 text-xs text-amber-700">
                Changing the hostname requires new ownership verification and separate, approved discovery consent. Previously approved knowledge is not automatically replaced.
              </p>
            </form>
          ) : null}
          {!canEditWebsite && !loading && !error ? (
            <p className="mt-2 text-xs text-slate-500">
              Website edits are locked while the discovery or consent pilot is configured.
              Your existing website and knowledge remain available for review.
            </p>
          ) : null}
          {!state.pilotEnabled && !state.discoveryEnabled && !loading && !error ? <p className="mt-2 text-xs text-amber-700">Website discovery is paused or this domain has not been approved for the pilot.</p> : null}
          {state.pilotEnabled && !state.websiteVerified && !loading ? <p className="mt-2 text-xs text-amber-700">Verify ownership of this website before scanning.</p> : null}
          <div className="mt-5 flex flex-wrap items-end justify-between gap-3 border-t border-slate-100 pt-4">
            <div>
              <label htmlFor="kb-limit" className="block text-xs font-medium text-slate-600">Page limit</label>
              <select id="kb-limit" value={pageLimit} onChange={e=>setPageLimit(Number(e.target.value))}
                className="mt-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
                {[10,20,30,50].map(n=><option value={n} key={n}>{n} pages</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              {active ? <button disabled={busy || loading} onClick={()=>void change('cancel')}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-xs font-semibold disabled:opacity-40"><Square size={13}/> Cancel scan</button> : null}
              <button disabled={busy || loading || Boolean(active) || !state.configuredWebsite || !state.discoveryEnabled}
                onClick={()=>void change('start')}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-40">
                <Play size={13}/> Start discovery
              </button>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><ShieldCheck size={17}/> Scan boundaries</div>
          <div className="space-y-3 text-xs leading-5 text-slate-600">
            <p>Only the exact configured and verified website hostname is included. Other hostnames require separate verification.</p>
            <p>Public IP, redirects, robots rules, response sizes, page limits, and crawl delays are checked.</p>
            <p>Discovery saves page metadata only. No unreviewed knowledge or customer messages are generated.</p>
            <p className="rounded-lg bg-slate-50 p-3">For large sites, the initial page cap limits coverage. A completed scan does not mean the entire website was analyzed.</p>
          </div>
        </div>
      </section>

      {state.pilotEnabled && state.configuredWebsite && !state.websiteVerified ? (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold">Verify website ownership</h2>
          <p className="mt-2 text-xs leading-5 text-slate-600">
            Publish a one-line verification token as a public text file on your configured HTTPS website.
            SalsysOS only checks this file and will not scan the website during verification.
          </p>
          <div className="mt-4 space-y-2">
            <p className="text-xs font-medium">Required file path</p>
            <code className="block break-all rounded-lg bg-slate-50 p-3 text-xs">/.well-known/salsysos-verification.txt</code>
            {ownershipToken ? (
              <>
                <p className="text-xs font-medium">File contents — copy this one-time token now</p>
                <code className="block break-all rounded-lg bg-slate-50 p-3 text-xs">{ownershipToken}</code>
                <p className="text-xs text-slate-500">The challenge expires after 24 hours. You can reissue a challenge after the cooldown.</p>
              </>
            ) : (
              <p className="text-xs text-slate-500">Challenge status: {verificationStatus}. A token is displayed only when issued.</p>
            )}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" disabled={verificationBusy || busy}
              onClick={() => void ownershipAction('issue')}
              className="rounded-lg border border-slate-200 px-4 py-2.5 text-xs font-semibold disabled:opacity-40">
              Generate token
            </button>
            <button type="button" disabled={verificationBusy || busy}
              onClick={() => void ownershipAction('verify')}
              className="rounded-lg bg-slate-800 px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-40">
              Verify website
            </button>
          </div>
        </section>
      ) : null}

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Latest scan</h2>
          {latest ? <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold">{statusText[latest.status]}</span> : null}
        </div>
        {loading && !latest ? <p className="mt-5 text-sm text-slate-500">Loading scan history…</p> :
        !state.historyAvailable ? <p className="mt-5 rounded-lg bg-slate-50 p-5 text-sm text-slate-500">Scan history is unavailable while discovery is disabled.</p> :
        !latest ? <p className="mt-5 rounded-lg bg-slate-50 p-5 text-sm text-slate-500">No scans yet. Start by discovering your configured business website.</p> : <>
          <p className="mt-1 break-all text-xs text-slate-500">{latest.seed_url}</p>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ['Discovered', latest.pages_discovered],
              ['Fetched', latest.pages_fetched],
              ['Blocked', latest.pages_blocked],
              ['Failed', latest.pages_failed],
            ].map(([label,value])=><div className="rounded-lg border border-slate-100 bg-slate-50 p-3" key={label}>
              <div className="text-xl font-semibold tabular-nums">{value}</div><div className="mt-1 text-xs text-slate-500">{label}</div>
            </div>)}
          </div>
          <p className="mt-4 text-xs text-slate-500">
            {latest.pages_discovered >= latest.max_pages ? 'Page cap reached or potentially truncated. ' : ''}
            {active ? 'The scan will advance when the authorized runner processes its next page.' : 'Only discovered pages were assessed; inaccessible content is not included.'}
          </p>
          {latest.last_error_code ? <p className="mt-2 text-xs text-amber-700">Job issue: {latest.last_error_code}</p> : null}
        </>}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold">Page inventory</h2>
        <p className="mt-1 text-xs text-slate-500">Individual outcomes from the latest scan. This is not an AI knowledge library.</p>
        <div className="mt-4 divide-y divide-slate-100">
          {state.pages.length === 0 ? <p className="py-6 text-sm text-slate-400">No pages discovered yet.</p> :
          state.pages.map(page => {
            const safeLink = safeDiscoveryPageLink(page.url, state.configuredWebsite);
            return <div className="flex flex-wrap items-center justify-between gap-3 py-3" key={page.id}>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold">{page.page_title || safeLink?.pathname || 'Unverified page'}</p>
                {safeLink ? <a href={safeLink.href} target="_blank" rel="noopener noreferrer"
                  className="block truncate text-xs text-slate-500 hover:underline">{safeLink.href}</a>
                  : <span className="text-xs text-amber-700">Link unavailable or outside the configured domain</span>}
                {page.failure_code ? <p className="mt-1 text-xs text-amber-700">{page.failure_code}</p> : null}
              </div>
              <span className="shrink-0 rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600">{page.status}</span>
            </div>;
          })}
        </div>
      </section>
      <p className="text-xs text-slate-400">Knowledge extraction, FAQ drafting, and approval are separate future checkpoints. Source pages are never instructions to SalsysOS.</p>
    </div>
  );
}
