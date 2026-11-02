import type { JourneyEvidence } from './journey-evidence';

export type JourneyContext = {
  leadId: string; stage: string; owner: string | null; nextFollowupAt?: string | null;
  readAt: string; tasks?: readonly { id: string; title: string; status: string; due_at: string | null }[];
  tasksState?: 'available' | 'empty' | 'unavailable';
};
export type JourneyAction = {
  code: 'refresh' | 'review' | 'owner' | 'followup' | 'payments';
  title: string; reason: string; label: string; tone: 'attention' | 'neutral'; dueAt?: string;
};
const closed = new Set(['enrolled', 'closed_won', 'lost', 'unqualified', 'duplicate']);
const deferred = new Set(['nurture', 'not_now']);
function timestamp(value: unknown): number {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value)) return NaN;
  const day = new Date(value.slice(0, 10) + 'T00:00:00Z');
  const clock = value.slice(11, 19).split(':').map(Number);
  return Number.isFinite(day.getTime()) && day.toISOString().slice(0, 10) === value.slice(0, 10) && clock[0] < 24 && clock[1] < 60 && clock[2] < 60 ? Date.parse(value) : NaN;
}

/** Service reminders use CRM commitments, never page visits, intent scores or inferred money. */
export function nextJourneyAction(evidence: JourneyEvidence, context: JourneyContext | undefined, now: number, readFailed = false): JourneyAction | null {
  if (!context || context.leadId !== evidence.leadId) return null;
  const read = timestamp(context.readAt);
  if (readFailed || !Number.isFinite(now) || !Number.isFinite(read) || read > now + 60_000 || now - read > 5 * 60_000) {
    return { code: 'refresh', title: 'Refresh before choosing the next action', reason: 'The CRM read is old or could not be refreshed. The saved history remains visible, but current commitments need a new read.', label: 'Refresh records', tone: 'neutral' };
  }
  if (closed.has(context.stage)) return { code: 'review', title: 'Review the recorded outcome', reason: 'This enquiry is in a completed or closed stage. Website activity and overdue tasks do not reopen it or establish payment.', label: 'Open profile', tone: 'neutral' };
  if (!new Set(['new', 'contacted', 'engaged', 'qualified', 'high_intent', 'payment_pending', 'nurture', 'not_now']).has(context.stage)) return { code: 'review', title: 'Review the CRM stage', reason: 'This stage is not recognized by the service-reminder rules. Review the current record before planning contact.', label: 'Open profile', tone: 'neutral' };
  if (!context.owner?.trim() || context.owner.trim().toLowerCase() === 'unassigned') return { code: 'owner', title: 'Give this enquiry a clear owner', reason: 'The CRM record has no assigned owner. Review assignment before the next service commitment is missed.', label: 'Review assignment', tone: 'attention' };
  const candidates = [
    ...(context.nextFollowupAt ? [{ at: context.nextFollowupAt, label: 'The CRM next follow-up' }] : []),
    ...(context.tasksState === 'available' ? (context.tasks ?? []).filter(t => t.status === 'open' || t.status === 'snoozed').filter(t => t.due_at).map(t => ({ at: t.due_at!, label: 'An open CRM task' })) : []),
  ];
  const valid = candidates.filter(c => Number.isFinite(timestamp(c.at))).sort((a, b) => timestamp(a.at) - timestamp(b.at));
  const next = valid[0];
  if (next && timestamp(next.at) <= now) return { code: 'followup', title: 'Review the overdue follow-up', reason: `${next.label} is due. Check the conversation before recording a new commitment; this reminder does not send a message.`, label: 'Review follow-up', tone: 'attention', dueAt: next.at };
  if (context.stage === 'payment_pending') return { code: 'payments', title: 'Check the payment-stage blocker', reason: 'The CRM stage is payment pending. Review the financial record and current agreement; a page visit or “I paid” message is not payment verification.', label: 'Review payments', tone: 'attention' };
  if (next) return { code: 'followup', title: 'Keep the scheduled commitment', reason: `${next.label} is scheduled. Avoid creating a duplicate task or sending an extra message solely because the website was revisited.`, label: 'Review follow-up', tone: 'neutral', dueAt: next.at };
  if (candidates.length) return { code: 'followup', title: 'Review the follow-up date', reason: 'A stored commitment has an invalid or ambiguous timestamp. Correct the source rather than treating it as overdue or absent.', label: 'Review follow-up', tone: 'neutral' };
  if (context.tasksState === 'unavailable' || context.tasksState === undefined) return { code: 'review', title: 'Check the existing follow-ups first', reason: 'The task list is unavailable in this view. An empty next-follow-up field does not prove that no commitment exists.', label: 'Open profile', tone: 'neutral' };
  if (deferred.has(context.stage)) return { code: 'review', title: 'Respect the recorded pause', reason: 'This enquiry is marked for later. Review the agreed timing before scheduling contact; website activity does not override that pause.', label: 'Open profile', tone: 'neutral' };
  return { code: 'followup', title: 'Agree on the next service step', reason: 'No dated commitment is present in the loaded CRM fields and task window. Review the conversation and record a useful next step.', label: 'Plan follow-up', tone: 'neutral' };
}

export type JourneyFilters = { phase: string; kind: string; source: string; range: string; search: string; page: string; order: string };
export const defaultJourneyFilters: JourneyFilters = { phase: 'all', kind: 'all', source: 'all', range: 'all', search: '', page: '', order: 'newest' };

/** All interactions derive from the already authorized projection; no extra collection or identity work. */
export function selectJourneyView(evidence: JourneyEvidence, filters: JourneyFilters) {
  if (evidence.state !== 'available') return { events: [], pages: [], sources: [], sessions: 0, pageViews: 0 };
  const query = filters.search.trim().toLocaleLowerCase().slice(0, 120);
  const cutoff = timestamp(evidence.through);
  const filtered = evidence.events.filter(event =>
    (filters.phase === 'all' || event.phase === filters.phase) &&
    (filters.kind === 'all' || event.kind === filters.kind) &&
    (filters.source === 'all' || event.source === filters.source) &&
    (filters.range !== '7d' || (Number.isFinite(cutoff) && timestamp(event.at) >= cutoff - 7 * 86_400_000)) &&
    (!query || [event.title, event.page ?? '', event.source].join(' ').toLocaleLowerCase().includes(query)));
  const pages = new Map<string, { path: string; views: number; sessions: Set<string> }>();
  for (const event of filtered) {
    if (event.kind !== 'website' || event.type !== 'page_view' || !event.page || /\[(?:Private page|redacted)\]/.test(event.page)) continue;
    const row = pages.get(event.page) ?? { path: event.page, views: 0, sessions: new Set<string>() };
    row.views++; if (event.session) row.sessions.add(event.session); pages.set(event.page, row);
  }
  const events = filtered.filter(e => !filters.page || e.page === filters.page).sort((a, b) => filters.order === 'oldest' ? a.at.localeCompare(b.at) || a.key.localeCompare(b.key) : b.at.localeCompare(a.at) || a.key.localeCompare(b.key));
  return {
    events, pages: [...pages.values()].map(p => ({ path: p.path, views: p.views, sessions: p.sessions.size })).sort((a, b) => b.views - a.views || a.path.localeCompare(b.path)).slice(0, 5),
    sources: [...new Set(evidence.events.filter(e => e.kind === 'website').map(e => e.source))].sort(),
    sessions: new Set(events.filter(e => e.kind === 'website' && e.session).map(e => e.session)).size,
    pageViews: events.filter(e => e.kind === 'website' && e.type === 'page_view').length,
  };
}

export function journeyReadAge(readAt: string | null, now: number): string {
  const age = now - timestamp(readAt);
  if (!Number.isFinite(age) || age < -60_000) return 'Read time unavailable';
  if (age < 60_000) return 'Read just now';
  if (age < 3_600_000) return `Read ${Math.floor(age / 60_000)} min ago`;
  if (age < 86_400_000) return `Read ${Math.floor(age / 3_600_000)} hr ago`;
  return `Read ${Math.floor(age / 86_400_000)} days ago`;
}
