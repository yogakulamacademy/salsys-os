/** A bounded presentation of authorized canonical records, never a collector or identity matcher. */
export type JourneyRecord = {
  organization_id: string; person_id: string; lead_id: string | null;
  journey_event_key: string; source_table: string; source_record_id: string;
  event_at: string; event_type: string; event_category: string;
  web_session_id: string | null; source: string | null;
  metadata?: Record<string, unknown> | null;
};
export type JourneyReadState = 'available' | 'restricted' | 'unavailable' | 'not_linked';
export type JourneyEvidenceEvent = {
  key: string; at: string; type: string; title: string;
  kind: 'website' | 'business'; evidence: 'Observed' | 'Recorded';
  phase: 'before' | 'after'; session: string | null; source: string; page: string | null;
};
export type JourneyEvidence = {
  version: 'journey_evidence_v1'; state: JourneyReadState;
  leadId: string; from: string | null; through: string | null; enquiryAt: string | null;
  partial: boolean; policy: 'unknown' | 'restricted' | 'permitted';
  counts: null | { sessions: number; pageViews: number; before: { sessions: number; pageViews: number }; after: { sessions: number; pageViews: number }; spanningSessions: number };
  events: JourneyEvidenceEvent[];
  diagnostics: { duplicates: number; conflicts: number; invalidTimes: number; invalidRecords: number; unassignedEvents: number };
};
type Input = {
  organizationId: string | null; personId: string | null; leadId: string;
  enquiryAt: string; asOf: string; rows: readonly JourneyRecord[]; total: number;
  readState?: JourneyReadState; policy?: JourneyEvidence['policy'];
};

const businessTables = new Set(['leads', 'lead_stage_history', 'lead_contact_logs', 'conversations', 'messages', 'enrollments', 'payments']);
const knownSources: Record<string, string> = { google: 'Google', 'google.com': 'Google', meta: 'Meta', facebook: 'Facebook', instagram: 'Instagram', ig: 'Instagram', direct: 'Direct', whatsapp: 'WhatsApp', 'chatgpt.com': 'ChatGPT', chatgpt: 'ChatGPT', organic: 'Organic' };

function instant(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value)) return null;
  const date = value.slice(0, 10), clock = value.slice(11, 19).split(':').map(Number);
  const day = new Date(date + 'T00:00:00Z');
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && Number.isFinite(day.getTime()) && day.toISOString().slice(0, 10) === date && clock[0] < 24 && clock[1] < 60 && clock[2] < 60 ? parsed : null;
}

/** Do not project URL query strings, fragments, userinfo or token-like path segments. */
export function journeyPage(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 4096) return null;
  try {
    if (!value.startsWith('/') && !/^https?:\/\//i.test(value)) return null;
    const url = new URL(value, 'https://journey.invalid');
    const path = decodeURIComponent(url.pathname);
    if (/(?:password|reset|verify|token|auth|email|phone)(?:\/|$)|@/i.test(path)) return '[Private page]';
    return path.split('/').map(part => part.length > 48 || /^\d{7,}$/.test(part) || /^[\da-f]{8}-[\da-f-]{27}$/i.test(part) ? '[redacted]' : part).join('/').slice(0, 240);
  } catch { return null; }
}

export function buildJourneyEvidence(input: Input): JourneyEvidence {
  const enquiry = instant(input.enquiryAt), cutoff = instant(input.asOf);
  const start = enquiry === null ? null : enquiry - 30 * 86400000;
  let state = input.readState ?? 'available';
  if (input.policy === 'restricted') state = 'restricted';
  if (state === 'available' && (!input.organizationId || !input.personId)) state = 'not_linked';
  if (enquiry === null || cutoff === null || cutoff < enquiry || !input.leadId) state = 'unavailable';
  const result: JourneyEvidence = {
    version: 'journey_evidence_v1', state, leadId: input.leadId,
    from: start === null ? null : new Date(start).toISOString(),
    through: cutoff === null ? null : new Date(cutoff).toISOString(),
    enquiryAt: enquiry === null ? null : new Date(enquiry).toISOString(),
    partial: input.total > input.rows.length || input.rows.length > 500,
    policy: input.policy ?? 'unknown', counts: null, events: [],
    diagnostics: { duplicates: 0, conflicts: 0, invalidTimes: 0, invalidRecords: 0, unassignedEvents: 0 },
  };
  if (state !== 'available' || start === null || enquiry === null || cutoff === null) return result;
  const records = new Map<string, { event: JourneyEvidenceEvent; fingerprint: string }>();
  const conflicts = new Set<string>();
  // The upstream read is capped. Do not turn this into an unbounded lifetime scan.
  for (const row of input.rows.slice(0, 500)) {
    if (!row || typeof row !== 'object') { result.diagnostics.invalidRecords++; continue; }
    if (row.organization_id !== input.organizationId || row.person_id !== input.personId) continue;
    if (row.lead_id !== input.leadId) {
      if (row.lead_id === null) result.diagnostics.unassignedEvents++;
      continue;
    }
    const time = instant(row.event_at);
    if (time === null || time > cutoff) { result.diagnostics.invalidTimes++; continue; }
    if (time < start) continue;
    const website = row.source_table === 'touchpoints' && row.event_category === 'digital';
    if (!website && !businessTables.has(row.source_table)) continue;
    if (typeof row.source_record_id !== 'string' || !/^[a-z0-9:_-]{1,128}$/i.test(row.source_record_id) || typeof row.journey_event_key !== 'string' || !row.journey_event_key || !/^[a-z0-9_]{1,80}$/i.test(row.event_type)) { result.diagnostics.invalidRecords++; continue; }
    const key = `${row.source_table}:${row.source_record_id}`;
    const event: JourneyEvidenceEvent = {
      key, at: new Date(time).toISOString(), type: row.event_type,
      title: website && row.event_type === 'payment_start' ? 'Payment page activity' : row.event_type.replaceAll('_', ' '),
      kind: website ? 'website' : 'business', evidence: website ? 'Observed' : 'Recorded',
      phase: time < enquiry ? 'before' : 'after', session: website && typeof row.web_session_id === 'string' && /^[a-z0-9:_-]{1,128}$/i.test(row.web_session_id) ? row.web_session_id : null,
      source: website ? knownSources[typeof row.source === 'string' ? row.source.trim().toLowerCase() : ''] ?? (row.source ? 'Other source' : 'Not recorded') : 'Business record',
      page: website ? journeyPage(row.metadata?.landing_page ?? row.metadata?.page_path) : null,
    };
    const fingerprint = JSON.stringify(event);
    const previous = records.get(key);
    if (previous) {
      result.diagnostics.duplicates++;
      if (previous.fingerprint !== fingerprint) conflicts.add(key);
    } else records.set(key, { event, fingerprint });
  }
  result.diagnostics.conflicts = conflicts.size;
  result.events = [...records.entries()].filter(([key]) => !conflicts.has(key)).map(([, record]) => record.event)
    .sort((a, b) => b.at.localeCompare(a.at) || a.key.localeCompare(b.key));
  const before = new Set<string>(), after = new Set<string>();
  let beforePages = 0, afterPages = 0;
  for (const event of result.events) {
    if (event.kind !== 'website') continue;
    if (event.session) (event.phase === 'before' ? before : after).add(event.session);
    if (event.type === 'page_view') event.phase === 'before' ? beforePages++ : afterPages++;
  }
  result.counts = {
    sessions: new Set([...before, ...after]).size, pageViews: beforePages + afterPages,
    before: { sessions: before.size, pageViews: beforePages }, after: { sessions: after.size, pageViews: afterPages },
    spanningSessions: [...before].filter(id => after.has(id)).length,
  };
  return result;
}
