'use client';

import { useId, useState } from 'react';
import { EmptyState } from '@/components/ui';
import type { JourneyEvidence } from '@/lib/journey-evidence';

export function JourneyEvidencePanel({ evidence }: { evidence: JourneyEvidence }) {
  const [phase, setPhase] = useState('all');
  const label = useId();
  if (evidence.state !== 'available') {
    const copy = evidence.state === 'restricted'
      ? ['Journey access is restricted', 'This history is not available for the current access or purpose. Service work can continue without behavioural scoring.']
      : evidence.state === 'not_linked'
        ? ['No supported journey link yet', 'Website history is not inferred from a device, email address or an empty record.']
        : ['Journey is temporarily unavailable', 'The source could not be loaded. Missing evidence is not zero activity.'];
    return <EmptyState title={copy[0]} description={copy[1]} variant="conversation" />;
  }
  const events = evidence.events.filter(event => phase === 'all' || event.phase === phase);
  const counts = evidence.counts!;
  const date = (value: string | null) => value ? new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value)) : 'Unknown';
  return <section aria-label="Enquiry journey evidence" className="rounded-xl border border-line bg-surface p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-base font-semibold text-copy-strong">Journey for this enquiry</h2>
        <p className="mt-1 text-xs leading-5 text-copy-muted">{date(evidence.from)} – {date(evidence.through)} · Times shown in UTC</p></div>
      <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700">{evidence.partial ? 'Partial history' : 'Available records'}</span>
    </div>
    {evidence.events.length > 0 && (counts.sessions > 0 || counts.pageViews > 0) ? <div className="mt-4 grid grid-cols-2 gap-3">
      {([['Before enquiry', counts.before], ['After enquiry', counts.after]] as const).map(([title, count]) => <div key={title} className="rounded-lg border border-line p-3">
        <div className="text-xs font-semibold text-copy-strong">{title}</div>
        <div className="mt-1 text-sm text-copy">{count.sessions} observed sessions · {count.pageViews} page views</div>
      </div>)}
      <p className="col-span-2 text-xs leading-5 text-copy-muted">{counts.sessions} distinct sessions · {counts.pageViews} page views in the loaded window. Sessions count activity on each side, not session starts. {counts.spanningSessions > 0 ? `${counts.spanningSessions} session(s) span the enquiry boundary and are counted once in the total.` : 'Session totals do not double-count the enquiry boundary.'}</p>
    </div> : null}
    <p className="mt-3 text-xs leading-5 text-copy-muted">Only records explicitly assigned to this enquiry are included. Other devices and unassigned history may be missing. {evidence.partial ? 'These are observed counts from partial history, not lifetime totals. ' : ''}{evidence.policy === 'unknown' ? 'Behavioural recommendations remain unavailable until usage permission is confirmed.' : 'Recorded permission does not authorize marketing sends or ad exports.'} Source freshness is not confirmed.</p>
    {evidence.diagnostics.conflicts > 0 || evidence.diagnostics.invalidTimes > 0 || evidence.diagnostics.invalidRecords > 0 ? <p className="mt-2 text-xs text-amber-700">Conflicting, malformed or invalid-time evidence was excluded. Review the source before drawing conclusions.</p> : null}
    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
      <label htmlFor={label} className="text-xs font-medium text-copy">Activity</label>
      <select id={label} className="input w-auto text-xs" value={phase} onChange={event => setPhase(event.target.value)}>
        <option value="all">All activity</option><option value="before">Before enquiry</option><option value="after">After enquiry</option>
      </select>
      <span className="text-xs text-copy-muted">Enquiry created {date(evidence.enquiryAt)}</span>
    </div>
    {events.length === 0 ? <EmptyState compact title={phase === 'all' ? 'No observed activity for this enquiry' : 'No activity in this view'} description={phase === 'all' ? 'The loaded window contains no explicitly linked activity. This does not establish a lack of interest.' : 'Choose All activity to return to the complete loaded view.'} action={phase !== 'all' ? <button className="btn-secondary" onClick={() => setPhase('all')}>Show all activity</button> : undefined} /> : <ol className="mt-4 space-y-3">
      {events.map(event => <li key={event.key} className="rounded-lg border border-line px-3 py-3 sm:px-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-surface-muted px-2 py-1 text-[11px] font-medium text-copy-muted">{event.evidence}</span><span className="text-xs text-copy-muted">{event.kind === 'website' ? 'Website activity' : 'Business record'} · {event.phase === 'before' ? 'Before enquiry' : 'After enquiry'}</span></div><time dateTime={event.at} className="text-xs text-copy-muted">{new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(event.at))}</time></div>
        <h3 className="mt-2 text-sm font-medium capitalize text-copy-strong">{event.title}</h3>
        {event.page ? <p className="mt-1 break-all text-xs text-copy-muted">{event.page}</p> : null}
        <p className="mt-1 text-xs text-copy-muted">{event.source}</p>
      </li>)}
    </ol>}
    <p className="mt-4 border-t border-line pt-3 text-xs leading-5 text-copy-muted">Website clicks and payment-page activity do not confirm a payment or enrollment. Verify financial outcomes in Payments. Aggregate search queries and AI citations are not personal activity.</p>
  </section>;
}
