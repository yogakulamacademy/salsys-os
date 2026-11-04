'use client';

import { useEffect, useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { EmptyState } from '@/components/ui';
import type { JourneyEvidence } from '@/lib/journey-evidence';
import { defaultJourneyFilters, journeyReadAge, nextJourneyAction, selectJourneyView, type JourneyAction, type JourneyContext, type JourneyFilters } from '@/lib/journey-workspace';

export function JourneyEvidencePanel({ evidence, context, onRefresh, refreshing = false, readFailed = false, onAction }: {
  evidence: JourneyEvidence; context?: JourneyContext; onRefresh?: () => void;
  refreshing?: boolean; readFailed?: boolean; onAction?: (action: JourneyAction) => void;
}) {
  const [filters, setFilters] = useState<JourneyFilters>({ ...defaultJourneyFilters });
  const [now, setNow] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const label = useId();
  useEffect(() => {
    const tick = () => { if (document.visibilityState === 'visible') setNow(Date.now()); };
    tick();
    const timer = window.setInterval(tick, 60_000);
    const untilExpiry = Date.parse(context?.readAt ?? '') + 300_001 - Date.now();
    const expiry = Number.isFinite(untilExpiry) && untilExpiry > 0 && untilExpiry < 2_147_483_647 ? window.setTimeout(tick, untilExpiry) : undefined;
    document.addEventListener('visibilitychange', tick);
    return () => { window.clearInterval(timer); window.clearTimeout(expiry); document.removeEventListener('visibilitychange', tick); };
  }, [context?.readAt]);
  // Preserve useful filters on refresh; switching to another enquiry starts a clean view.
  useEffect(() => setFilters({ ...defaultJourneyFilters }), [evidence.leadId]);
  const refresh = () => onRefresh ? onRefresh() : startTransition(() => router.refresh());
  const busy = refreshing || pending;
  const action = now === null ? null : nextJourneyAction(evidence, context, now, readFailed);
  const view = selectJourneyView(evidence, filters);
  const changed = Object.keys(defaultJourneyFilters).some(key => filters[key as keyof JourneyFilters] !== defaultJourneyFilters[key as keyof JourneyFilters]);
  const update = (key: keyof JourneyFilters, value: string) => setFilters(old => ({ ...old, [key]: value, ...(key !== 'page' && key !== 'order' ? { page: '' } : {}) }));
  const date = (value: string | null, time = false) => {
    if (!value || !Number.isFinite(Date.parse(value))) return 'Unknown';
    return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', dateStyle: 'medium', ...(time ? { timeStyle: 'short' as const } : {}) }).format(new Date(value));
  };
  const href = action ? `/leads/${encodeURIComponent(evidence.leadId)}${action.code === 'followup' ? '#schedule-follow-up' : action.code === 'payments' ? '#payments' : ''}` : '';
  const actionControl = action && (action.code === 'refresh'
    ? <button type="button" className="btn-secondary" disabled={busy} onClick={refresh}>{busy ? 'Refreshing…' : action.label}</button>
    : onAction && action.code === 'followup'
      ? <button type="button" className="btn-secondary" onClick={() => onAction(action)}>{action.label}</button>
      : <a className="btn-secondary" href={href}>{action.label}</a>);

  return <section aria-label="Enquiry journey evidence" aria-busy={busy} className="rounded-xl border border-line bg-surface p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-base font-semibold text-copy-strong">Journey for this enquiry</h2>
        <p className="mt-1 text-xs leading-5 text-copy-muted">{date(evidence.from)} – {date(evidence.through)} · Times shown in UTC</p>
        <p className="text-xs text-copy-muted">{now === null ? 'Checking load time…' : journeyReadAge(context?.readAt ?? evidence.through, now)} · Source freshness unconfirmed</p>
      </div>
      <button type="button" className="btn-secondary inline-flex items-center gap-2" disabled={busy} aria-label="Refresh Journey" onClick={refresh}><RefreshCw size={14} className={busy ? 'animate-spin' : ''} />{busy ? 'Refreshing…' : 'Refresh'}</button>
    </div>

    {action ? <aside aria-label="Next service step" className={`mt-4 rounded-lg border p-4 ${action.tone === 'attention' ? 'border-amber-200 bg-amber-50' : 'border-line bg-surface-muted'}`}>
      <p className="text-xs font-medium text-copy-muted">Next service step · CRM commitments</p>
      <h3 className="mt-1 text-sm font-semibold text-copy-strong">{action.title}</h3>
      <p className="mt-1 text-xs leading-5 text-copy">{action.reason}</p>
      {action.dueAt ? <p className="mt-2 text-xs text-copy-muted">Due <time dateTime={action.dueAt}>{date(action.dueAt, true)} UTC</time></p> : null}
      <div className="mt-3">{actionControl}</div>
    </aside> : null}

    {evidence.state !== 'available' || !evidence.counts ? <EmptyState
      title={evidence.state === 'restricted' ? 'Journey access is restricted' : evidence.state === 'not_linked' ? 'No supported journey link yet' : 'Journey is temporarily unavailable'}
      description={evidence.state === 'restricted' ? 'This history is not available for the current access or purpose. CRM service commitments remain separate from behavioural scoring.' : evidence.state === 'not_linked' ? 'Website history is not inferred from a device, email address or an empty record.' : 'The source could not be loaded. Missing evidence is not zero activity.'}
      variant="conversation" /> : <>
      <div className="mt-4 flex flex-wrap items-center gap-2"><span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700">{evidence.partial ? 'Partial history' : 'Available records'}</span><span className="text-xs text-copy-muted">Enquiry created {date(evidence.enquiryAt)}</span></div>
      {evidence.events.length > 0 && (evidence.counts.sessions > 0 || evidence.counts.pageViews > 0) ? <div className="mt-4 grid grid-cols-2 gap-3">
        {([['Before enquiry', evidence.counts.before], ['After enquiry', evidence.counts.after]] as const).map(([title, count]) => <div key={title} className="rounded-lg border border-line p-3">
          <div className="text-xs font-semibold text-copy-strong">{title}</div><div className="mt-1 text-sm text-copy">{count.sessions} observed sessions · {count.pageViews} page views</div>
        </div>)}
        <p className="col-span-2 text-xs leading-5 text-copy-muted">{evidence.counts.sessions} distinct sessions · {evidence.counts.pageViews} page views in the loaded window. Sessions count activity on each side, not session starts. {evidence.counts.spanningSessions > 0 ? `${evidence.counts.spanningSessions} session(s) span the enquiry boundary and are counted once in the total.` : 'Session totals do not double-count the enquiry boundary.'}</p>
      </div> : null}
      <p className="mt-3 text-xs leading-5 text-copy-muted">Only records explicitly assigned to this enquiry are included. Other devices and unassigned history may be missing. {evidence.partial ? 'These are observed counts from partial history, not lifetime totals. ' : ''}{evidence.policy === 'unknown' ? 'Behavioural recommendations remain unavailable until usage permission is confirmed.' : 'Recorded permission does not authorize marketing sends or ad exports.'}</p>
      {evidence.diagnostics.conflicts > 0 || evidence.diagnostics.invalidTimes > 0 || evidence.diagnostics.invalidRecords > 0 ? <p className="mt-2 text-xs text-amber-700">Conflicting, malformed or invalid-time evidence was excluded. Review the source before drawing conclusions.</p> : null}

      {evidence.events.length > 0 ? <>
        <fieldset className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4 sm:grid-cols-3">
          <legend className="sr-only">Filter journey evidence</legend>
          <label className="text-xs text-copy" htmlFor={`${label}-phase`}>Activity<select id={`${label}-phase`} className="input mt-1 w-full text-xs" value={filters.phase} onChange={e => update('phase', e.target.value)}><option value="all">All activity</option><option value="before">Before enquiry</option><option value="after">After enquiry</option></select></label>
          <label className="text-xs text-copy" htmlFor={`${label}-kind`}>Record type<select id={`${label}-kind`} className="input mt-1 w-full text-xs" value={filters.kind} onChange={e => update('kind', e.target.value)}><option value="all">All records</option><option value="website">Website activity</option><option value="business">Business records</option></select></label>
          <label className="text-xs text-copy" htmlFor={`${label}-source`}>Source<select id={`${label}-source`} className="input mt-1 w-full text-xs" value={filters.source} onChange={e => update('source', e.target.value)}><option value="all">All sources</option>{filters.source !== 'all' && !view.sources.includes(filters.source) ? <option value={filters.source}>{filters.source} (not in this read)</option> : null}{view.sources.map(source => <option key={source} value={source}>{source}</option>)}</select></label>
          <label className="text-xs text-copy" htmlFor={`${label}-range`}>Period<select id={`${label}-range`} className="input mt-1 w-full text-xs" value={filters.range} onChange={e => update('range', e.target.value)}><option value="all">Loaded window</option><option value="7d">Last 7 days of read</option></select></label>
          <label className="text-xs text-copy" htmlFor={`${label}-order`}>Order<select id={`${label}-order`} className="input mt-1 w-full text-xs" value={filters.order} onChange={e => update('order', e.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></label>
          <label className="text-xs text-copy" htmlFor={`${label}-search`}>Search evidence<input id={`${label}-search`} className="input mt-1 w-full text-xs" type="search" placeholder="Page, event or source" maxLength={120} value={filters.search} onChange={e => update('search', e.target.value)} /></label>
        </fieldset>
        <div className="mt-3 flex flex-wrap items-center gap-2" role="status" aria-live="polite"><p className="text-xs text-copy-muted">{view.events.length} of {evidence.events.length} records shown{view.events.length > 0 ? ` · ${view.sessions} observed sessions · ${view.pageViews} page views` : ''}</p>{changed ? <button type="button" className="text-xs font-medium text-brand-700 underline" onClick={() => setFilters({ ...defaultJourneyFilters })}>Reset filters</button> : null}</div>
        {filters.page ? <p className="mt-2 break-all text-xs text-copy">Page: {filters.page}</p> : null}
        {view.pages.length > 0 ? <details className="mt-4 rounded-lg border border-line p-3" open>
          <summary className="cursor-pointer text-sm font-medium text-copy-strong">Most viewed pages in this view</summary>
          <p className="mt-1 text-xs leading-5 text-copy-muted">Observed page views from the loaded records. Visits do not establish intent, ad exposure or a purchase. Select a page to inspect its events.</p>
          <table className="mt-3 w-full table-fixed text-left text-xs"><thead><tr className="border-b border-line text-copy-muted"><th className="w-2/3 pb-2 font-medium">Page</th><th className="pb-2 text-right font-medium">Views</th><th className="pb-2 text-right font-medium">Sessions</th></tr></thead><tbody>{view.pages.map(page => <tr key={page.path} className="border-b border-line last:border-0"><td className="py-3 pr-2"><button type="button" className="break-all text-left font-medium text-brand-700 underline" aria-label={`Filter to ${page.path}`} aria-pressed={filters.page === page.path} onClick={() => update('page', filters.page === page.path ? '' : page.path)}>{page.path}</button></td><td className="py-3 text-right text-copy">{page.views}</td><td className="py-3 text-right text-copy">{page.sessions}</td></tr>)}</tbody></table>
        </details> : null}
      </> : null}
      {view.events.length === 0 ? <EmptyState compact title={changed ? 'No activity matches these filters' : 'No observed activity for this enquiry'} description={changed ? 'Reset the filters to return to the complete loaded view.' : 'The loaded window contains no explicitly linked activity. This does not establish a lack of interest.'} action={changed ? <button type="button" className="btn-secondary" onClick={() => setFilters({ ...defaultJourneyFilters })}>Show all activity</button> : undefined} /> : <ol aria-label="Journey events" className="mt-4 space-y-3">
        {view.events.map(event => <li key={event.key} className="rounded-lg border border-line px-3 py-3 sm:px-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-surface-muted px-2 py-1 text-[11px] font-medium text-copy-muted">{event.evidence}</span><span className="text-xs text-copy-muted">{event.kind === 'website' ? 'Website activity' : 'Business record'} · {event.phase === 'before' ? 'Before enquiry' : 'After enquiry'}</span></div><time dateTime={event.at} className="text-xs text-copy-muted">{date(event.at, true)}</time></div>
          <h3 className="mt-2 text-sm font-medium capitalize text-copy-strong">{event.title}</h3>
          {event.page ? <p className="mt-1 break-all text-xs text-copy-muted">{event.page}</p> : null}<p className="mt-1 text-xs text-copy-muted">{event.source}</p>
        </li>)}
      </ol>}
    </>}
    <p className="mt-4 border-t border-line pt-3 text-xs leading-5 text-copy-muted">Website clicks and payment-page activity do not confirm a payment or enrollment. Verify financial outcomes in Payments. Aggregate search queries and AI citations are not personal activity.</p>
  </section>;
}
