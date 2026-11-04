'use client';

import { useEffect, useId, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, CalendarClock, Globe2, Layers3, RefreshCw, Route, Sparkles } from 'lucide-react';
import { EmptyState } from '@/components/ui';
import type { JourneyEvidence } from '@/lib/journey-evidence';
import { defaultJourneyFilters, journeyReadAge, nextJourneyAction, selectJourneyView, type JourneyAction, type JourneyContext, type JourneyFilters } from '@/lib/journey-workspace';

// The inspector tells a chronological story. Other consumers retain their defaults.
const inspectorJourneyDefaults: JourneyFilters = { ...defaultJourneyFilters, order: 'oldest' };

export function JourneyEvidencePanel({ evidence, context, onRefresh, refreshing = false, readFailed = false, onAction }: {
  evidence: JourneyEvidence; context?: JourneyContext; onRefresh?: () => void;
  refreshing?: boolean; readFailed?: boolean; onAction?: (action: JourneyAction) => void;
}) {
  const [filters, setFilters] = useState<JourneyFilters>({ ...inspectorJourneyDefaults });
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
  useEffect(() => setFilters({ ...inspectorJourneyDefaults }), [evidence.leadId]);
  const refresh = () => onRefresh ? onRefresh() : startTransition(() => router.refresh());
  const busy = refreshing || pending;
  const action = now === null ? null : nextJourneyAction(evidence, context, now, readFailed);
  const view = selectJourneyView(evidence, filters);
  const changed = (Object.keys(inspectorJourneyDefaults) as (keyof JourneyFilters)[])
    .some(key => filters[key] !== inspectorJourneyDefaults[key]);
  const update = (key: keyof JourneyFilters, value: string) =>
    setFilters(old => ({ ...old, [key]: value, ...(key !== 'page' && key !== 'order' ? { page: '' } : {}) }));
  const date = (value: string | null, time = false) => {
    if (!value || !Number.isFinite(Date.parse(value))) return 'Unknown';
    return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', dateStyle: 'medium', ...(time ? { timeStyle: 'short' as const } : {}) }).format(new Date(value));
  };
  const actionHref = action
    ? `/leads/${encodeURIComponent(evidence.leadId)}${action.code === 'followup' ? '#schedule-follow-up' : action.code === 'payments' ? '#payments' : ''}`
    : '';

  const actionControl = action?.code === 'refresh'
    ? <button type="button" className="si3-secondary" disabled={busy} onClick={refresh}>{busy ? 'Refreshing…' : action.label}</button>
    : action && onAction && action.code === 'followup'
      ? <button type="button" className="si3-secondary" onClick={() => onAction(action)}>{action.label}</button>
      : action ? <Link className="si3-secondary" href={actionHref}>{action.label} <ArrowRight size={13}/></Link> : null;

  const stateTitle = evidence.state === 'restricted'
    ? 'Journey access is restricted'
    : evidence.state === 'not_linked' ? 'No supported journey link yet' : 'Journey temporarily unavailable';
  const stateDescription = evidence.state === 'restricted'
    ? 'This history is not available for the current access or purpose. CRM service commitments remain separate from behavioural scoring.'
    : evidence.state === 'not_linked'
      ? 'Website history is not inferred from a device, email address, or empty record.'
      : 'The source could not be loaded. Missing evidence is not zero activity.';

  return <section aria-label="Enquiry journey evidence" aria-busy={busy} className="space-y-3">
    <div className="si3-evidence-meta">
      <div><h2 className="text-[13px] font-semibold">Journey for this enquiry</h2><p>{evidence.events.length} linked records · Times shown in UTC</p></div>
      <button type="button" className="si3-secondary" onClick={refresh} disabled={busy} aria-label="Refresh Journey">
        <RefreshCw size={13} className={busy ? 'animate-spin' : ''} /> {busy ? 'Refreshing…' : 'Refresh'}
      </button>
    </div>

    {evidence.state === 'available' && evidence.counts ? (
      <>
        <div className="si3-journey-card si3-journey-insight">
          <h3><Sparkles size={16} /> Journey insight · recorded evidence</h3>
          <p>{evidence.policy === 'unknown' || evidence.policy === 'restricted'
            ? 'Behavioural recommendations remain unavailable until usage permission is confirmed. The recorded CRM timeline remains visible.'
            : evidence.counts.pageViews > 0
              ? `${evidence.counts.pageViews} observed page view(s) across ${evidence.counts.sessions} linked session(s) in the loaded window. Visits are not proof of purchase intent.`
              : 'The available record shows a CRM journey, but no explicitly linked website page views in the loaded window.'}</p>
        </div>

        <div className="si3-evidence-meta" aria-label="Observed journey counts">
          <span>{evidence.counts.before.sessions} observed sessions · {evidence.counts.before.pageViews} page views</span>
          <span>{evidence.counts.after.sessions} observed sessions · {evidence.counts.after.pageViews} page views</span>
        </div>

        {action ? <div className="si3-journey-card">
          <div className="si3-card-heading"><span className="si3-icon"><CalendarClock size={16}/></span><h3>Next service step</h3></div>
          <h3 className="si3-focus-title">{action.title}</h3>
          <p className="si3-focus-detail">{action.reason}</p>
          {action.dueAt ? <p className="si3-focus-detail">Due: {date(action.dueAt, true)} UTC</p> : null}
          <div className="si3-focus-actions">{actionControl}</div>
        </div> : null}

        <fieldset className="si3-filter-row">
          <legend className="sr-only">Filter journey evidence</legend>
          <label htmlFor={`${label}-phase`}>Activity
            <select id={`${label}-phase`} className="si3-select" value={filters.phase} onChange={e => update('phase', e.target.value)}>
              <option value="all">All activity</option><option value="before">Before enquiry</option><option value="after">After enquiry</option>
            </select>
          </label>
          <label htmlFor={`${label}-kind`}>Record type
            <select id={`${label}-kind`} className="si3-select" value={filters.kind} onChange={e => update('kind', e.target.value)}>
              <option value="all">All records</option><option value="website">Website activity</option><option value="business">Business records</option>
            </select>
          </label>
          <label htmlFor={`${label}-source`}>Source
            <select id={`${label}-source`} className="si3-select" value={filters.source} onChange={e => update('source', e.target.value)}>
              <option value="all">All sources</option>
              {filters.source !== 'all' && !view.sources.includes(filters.source) ? <option value={filters.source}>{filters.source} (not in read)</option> : null}
              {view.sources.map(source => <option key={source} value={source}>{source}</option>)}
            </select>
          </label>
        </fieldset>
        <div className="si3-journey-search"><label htmlFor={`${label}-search`}>Search evidence
          <input className="si3-search" id={`${label}-search`} type="search" placeholder="Page, event or source" maxLength={120} value={filters.search} onChange={e => update('search', e.target.value)}/>
        </label></div>

        <details className="si3-filter-more">
          <summary>More filters</summary>
          <div className="si3-filter-more-fields">
            <label htmlFor={`${label}-range`}>Period
              <select className="si3-select" id={`${label}-range`} value={filters.range} onChange={e => update('range', e.target.value)}>
                <option value="all">Loaded window</option><option value="7d">Last 7 days of read</option>
              </select>
            </label>
            <label htmlFor={`${label}-order`}>Order
              <select className="si3-select" id={`${label}-order`} value={filters.order} onChange={e => update('order', e.target.value)}>
                <option value="oldest">Oldest first</option><option value="newest">Newest first</option>
              </select>
            </label>
 
          </div>
        </details>

        <div className="si3-evidence-meta" role="status" aria-live="polite">
          <span>{view.events.length} of {evidence.events.length} records shown{evidence.partial ? ' · Partial history' : ''}</span>
          {changed ? <button className="si3-secondary" type="button" onClick={() => setFilters({ ...inspectorJourneyDefaults })}>Reset filters</button> : null}
        </div>

        {view.pages.length > 0 ? <div className="si3-page-quick-filters">
          <span>Top pages</span>
          {view.pages.map(page => <button type="button" className="si3-secondary" key={page.path} onClick={() => update('page', filters.page === page.path ? '' : page.path)}
            aria-label={`Filter to ${page.path}`} aria-pressed={filters.page === page.path}
            title={`${page.views} views in the loaded evidence`}>
              {page.path} · {page.views} views
            </button>)}
        </div> : null}

        {view.events.length === 0
          ? <div className="si3-empty"><strong>{changed ? 'No activity matches these filters' : 'No observed activity for this enquiry'}</strong>
              <p>{changed ? 'Reset filters to see the available records.' : 'No explicitly linked activity is in the loaded window; this does not establish a lack of interest.'}</p>
              {changed ? <button type="button" className="si3-secondary mt-3" onClick={() => setFilters({ ...inspectorJourneyDefaults })}>Show all activity</button> : null}
            </div>
          : <ol aria-label="Journey events" className="si3-timeline">
              {view.events.map(event => <li key={event.key}>
                <div className="si3-timeline-entry">
                  <span className="si3-icon" aria-hidden="true">{event.kind === 'website' ? <Globe2 size={15}/> : <Layers3 size={15}/>}</span>
                  <div className="si3-timeline-copy">
                    <h3>{event.title}</h3>
                    <p>{event.page || event.source} · {event.evidence} · {event.phase === 'before' ? 'Before enquiry' : 'After enquiry'}</p>
                  </div>
                  <time dateTime={event.at}>{date(event.at, true)}</time>
                </div>
              </li>)}
            </ol>
        }

        <details className="si3-evidence-more">
          <summary>Evidence details and limitations</summary>
          <p>{journeyReadAge(context?.readAt ?? evidence.through, now ?? Date.now())} · Source freshness unconfirmed · Enquiry created {date(evidence.enquiryAt)}.</p>
          <p>{evidence.counts.sessions} distinct linked sessions; {evidence.counts.pageViews} observed page views in the loaded window. Sessions spanning the enquiry boundary count only once in the total.</p>
          <p>Only explicitly assigned records are included. Unassigned devices and history may be missing. Website activity does not verify a payment or enrollment; see Payments for financial outcomes.</p>
          <p>{evidence.policy === 'unknown' ? 'Behavioural recommendations remain unavailable until usage permission is confirmed.' : 'Recorded usage permission is separate from marketing or ad-export consent.'}</p>
          {evidence.diagnostics.conflicts + evidence.diagnostics.invalidTimes + evidence.diagnostics.invalidRecords > 0
            ? <p>Conflicting, malformed or invalid-time evidence has been excluded. Review source records before drawing conclusions.</p> : null}

        </details>
      </>
    ) : <>
      {action ? <div className="si3-journey-card">
        <div className="si3-card-heading"><span className="si3-icon"><Route size={15}/></span><h3>CRM next service step</h3></div>
        <h3 className="si3-focus-title">{action.title}</h3>
        <p className="si3-focus-detail">{action.reason}</p>
        <div className="si3-focus-actions">{actionControl}</div>
      </div> : null}
      <EmptyState title={stateTitle} description={stateDescription} variant="conversation" />
    </>}
  </section>;
}
