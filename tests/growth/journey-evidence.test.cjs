const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const fixture = require('./fixtures/gt01.json');
function load(relative, dependencies = {}) {
  const filename = path.resolve(__dirname, '../..', relative);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function('require', 'exports', code)(name => {
    if (name === 'server-only') return {};
    if (Object.hasOwn(dependencies, name)) return dependencies[name];
    throw Error(`Unexpected dependency ${name}`);
  }, exports);
  return exports;
}
const { buildJourneyEvidence, journeyPage } = load('lib/journey-evidence.ts');
// A synthetic canonical-read adapter. This deliberately does not claim to test
// collector ingestion, identity matching, database policy or financial commands.
const rows = fixture.event_deliveries.map(event => ({
  organization_id: event.tenant, person_id: fixture.identity.person.id,
  lead_id: fixture.opportunity.id, journey_event_key: event.source_event_id,
  source_record_id: event.source_event_id,
  source_table: event.event_type === 'lead_created' ? 'leads' : event.session_id ? 'touchpoints' : 'unsupported_finance_adapter',
  event_category: event.session_id ? 'digital' : 'crm', event_type: event.event_type,
  event_at: event.occurred_at, web_session_id: event.session_id ?? null,
  source: fixture.sessions.find(session => session.id === event.session_id)?.source ?? null,
  metadata: { landing_page: event.page_path },
}));
const input = () => ({ organizationId: fixture.scope.tenant, personId: fixture.identity.person.id, leadId: fixture.opportunity.id, enquiryAt: fixture.event_deliveries.find(e => e.event_type === 'lead_created').occurred_at, asOf: fixture.scope.as_of, rows, total: rows.length, policy: 'permitted' });

test('GT-01 journey projection: four sessions, seven page views, three before and four after', () => {
  const actual = buildJourneyEvidence(input());
  assert.deepEqual(actual.counts, { sessions: 4, pageViews: 7, before: { sessions: 2, pageViews: 3 }, after: { sessions: 2, pageViews: 4 }, spanningSessions: 0 });
  assert.equal(actual.diagnostics.duplicates, 1); // the website event retry; finance is outside this projection
  assert.equal(actual.diagnostics.conflicts, 0);
  assert.equal(actual.events.filter(e => e.type === 'form_submit').length, 1);
  assert.equal(actual.events.filter(e => e.type === 'lead_created').length, 1);
});
test('replay and reordered delivery preserve the same observed counts and event order', () => {
  const original = buildJourneyEvidence(input());
  const replay = buildJourneyEvidence({ ...input(), rows: [...rows, ...rows].reverse(), total: rows.length * 2 });
  assert.deepEqual(replay.counts, original.counts);
  assert.deepEqual(replay.events, original.events);
});
test('a spanning session can appear on both sides but is counted once in the total', () => {
  const extra = { ...rows[0], source_record_id: 'span', event_at: '2026-10-02T10:06:00+05:30', web_session_id: 'GT-S2' };
  const result = buildJourneyEvidence({ ...input(), rows: [...rows, extra] });
  assert.equal(result.counts.sessions, 4);
  assert.equal(result.counts.before.sessions, 2);
  assert.equal(result.counts.after.sessions, 3);
  assert.equal(result.counts.spanningSessions, 1);
});
test('tenant, person and enquiry boundaries cannot contaminate counts or collide with valid evidence', () => {
  const contamination = [ { ...rows[0], organization_id: 'GT-B' }, { ...rows[0], person_id: 'someone-else' }, { ...rows[0], lead_id: 'second-enquiry' }, { ...rows[0], lead_id: null } ];
  const result = buildJourneyEvidence({ ...input(), rows: [...rows, ...contamination] });
  assert.deepEqual(result.counts, buildJourneyEvidence(input()).counts);
  assert.equal(result.diagnostics.unassignedEvents, 1);
});
test('denied, failed, unlinked and purpose-restricted reads produce unknown counts', () => {
  for (const readState of ['restricted', 'unavailable', 'not_linked']) {
    const result = buildJourneyEvidence({ ...input(), readState });
    assert.equal(result.counts, null); assert.equal(result.events.length, 0);
  }
  const denied = buildJourneyEvidence({ ...input(), policy: 'restricted' });
  assert.equal(denied.state, 'restricted'); assert.equal(denied.counts, null);
});
test('conflicting retries are withheld rather than choosing a delivery-order winner', () => {
  const conflict = { ...rows[0], event_at: '2026-09-28T09:01:00+05:30' };
  const result = buildJourneyEvidence({ ...input(), rows: [...rows, conflict] });
  const reverse = buildJourneyEvidence({ ...input(), rows: [conflict, ...rows].reverse() });
  assert.equal(result.diagnostics.conflicts, 1); assert.equal(result.counts.pageViews, 6);
  assert.deepEqual(result.events, reverse.events);
});
test('occurrence time controls the boundary; receipt time, invalid and future clocks cannot move it', () => {
  const extras = ['2026-02-30T10:00:00Z', '2026-10-99T10:00:00Z', '2026-10-16T10:00:00Z', 'invalid'].map((event_at, n) => ({ ...rows[0], source_record_id: `bad-${n}`, event_at }));
  const result = buildJourneyEvidence({ ...input(), rows: [...rows, ...extras] });
  assert.equal(result.diagnostics.invalidTimes, 4); assert.equal(result.counts.pageViews, 7);
  const boundary = buildJourneyEvidence({ ...input(), rows: [{ ...rows[0], event_at: input().enquiryAt }] });
  assert.equal(boundary.counts.before.pageViews, 0); assert.equal(boundary.counts.after.pageViews, 1);
});
test('raw matching IDs, query strings, financial metadata and aggregate queries are never projected', () => {
  const row = { ...rows[0], metadata: { landing_page: 'https://user:secret@example.test/200H?email=private@example.test&token=secret#private', gclid: 'secret-click', email_hash: 'secret-hash', amount: 90000 }, title: 'private@example.test', summary: 'secret' };
  const aggregate = { ...row, source_table: 'search_query_report', source_record_id: 'aggregate', event_type: 'page_view' };
  const serialized = JSON.stringify(buildJourneyEvidence({ ...input(), rows: [row, aggregate] }));
  assert.ok(serialized.includes('/200H'));
  for (const privateValue of ['secret', 'private@example', 'gclid', 'email_hash', '90000', 'search_query_report']) assert.equal(serialized.includes(privateValue), false);
  assert.equal(journeyPage('/password/reset/abc?token=abc'), '[Private page]');
});
test('browser purchase/payment observations cannot become financial verification or cash', () => {
  const result = buildJourneyEvidence({ ...input(), rows: [{ ...rows[0], event_type: 'payment_start', metadata: { amount: 90000, status: 'paid' } }] });
  assert.equal(result.events[0].evidence, 'Observed'); assert.equal(result.events[0].kind, 'website');
  assert.equal(result.counts.pageViews, 0); assert.equal('netCash' in result, false);
});
test('bounded reads declare incomplete coverage; an empty read does not create zero-valued probability', () => {
  const partial = buildJourneyEvidence({ ...input(), total: 999 });
  assert.equal(partial.partial, true);
  const empty = buildJourneyEvidence({ ...input(), rows: [], total: 0, policy: 'unknown' });
  assert.equal(empty.policy, 'unknown'); assert.equal(empty.events.length, 0);
  assert.equal('purchaseProbability' in empty, false);
});
test('existing loader distinguishes denied access from an empty history', async () => {
  const client = { rpc: async () => ({ data: { organization_id: 'GT-A', access_granted: false }, error: null }) };
  const loader = load('lib/person-journey-data.ts', { '@/lib/config': { useMockData: false }, '@/lib/supabase/server': { createClient: async () => client }, '@/lib/workspace': {} });
  const result = await loader.getPersonJourneyForLead('GT-O1');
  assert.equal(result.readState, 'restricted'); assert.deepEqual(result.journey, []);
});
test('legacy read failure is unavailable, not a successful empty history', async () => {
  const client = {
    rpc: async name => name === 'get_current_person_journey_workspace_v1'
      ? { data: { organization_id: 'GT-A', access_granted: true, __legacyFallbackRequired: true }, error: null }
      : { data: null, error: { message: 'synthetic read unavailable' } },
    from: table => {
      const reply = table === 'person_leads' ? { data: { person_id: 'GT-P1' }, error: null }
        : table === 'v_person_360' ? { data: null, error: null }
          : { data: null, error: { message: 'synthetic read unavailable' }, count: null };
      const query = { select: () => query, eq: () => query, order: () => query, limit: () => query, maybeSingle: async () => reply, then: (resolve, reject) => Promise.resolve(reply).then(resolve, reject) };
      return query;
    },
  };
  const loader = load('lib/person-journey-data.ts', { '@/lib/config': { useMockData: false }, '@/lib/supabase/server': { createClient: async () => client }, '@/lib/workspace': {} });
  const result = await loader.getPersonJourneyForLead('GT-O1');
  assert.equal(result.readState, 'unavailable'); assert.deepEqual(result.journey, []);
});
test('Inspector authorizes the selected lead before querying related evidence', async () => {
  let relatedRead = false;
  const inspector = load('lib/lead-inspector-data.ts', {
    '@/lib/data': { getLead: async () => null }, '@/lib/person-journey-data': {},
    '@/lib/journey-evidence': { buildJourneyEvidence },
    '@/lib/supabase/server': { createClient: async () => { relatedRead = true; throw Error('must not read'); } },
  });
  assert.equal(await inspector.getLeadInspectorData('denied-lead'), null);
  assert.equal(relatedRead, false);
});
test('Inspector API projection removes raw identifiers and unrelated opportunity events', async () => {
  const query = () => { const q = { select: () => q, eq: () => q, in: () => q, order: () => q, limit: () => q, maybeSingle: async () => ({ data: null, error: null }), then: (resolve, reject) => Promise.resolve({ data: [], error: null }).then(resolve, reject) }; return q; };
  const inspector = load('lib/lead-inspector-data.ts', {
    '@/lib/data': { getLead: async () => ({ id: 'GT-O1', createdAt: input().enquiryAt }), getLeadPayments: async () => [] },
    '@/lib/person-journey-data': { getPersonJourneyForLead: async () => ({ organizationId: 'GT-A', personId: 'GT-P1', readState: 'available', person: { person_id: 'GT-P1', primary_email: 'private@example.test', primary_whatsapp: 'secret-phone' }, journey: [ { ...rows[0], metadata: { landing_page: '/200H?token=secret-token', gclid: 'secret-click' } }, { ...rows[0], lead_id: 'other-opportunity', source_record_id: 'other-private-id' } ], journeyTotal: 2 }) },
    '@/lib/journey-evidence': { buildJourneyEvidence }, '@/lib/supabase/server': { createClient: async () => ({ from: query }) },
  });
  const result = await inspector.getLeadInspectorData('GT-O1');
  assert.equal(result.journeyEvidence.counts.pageViews, 1);
  assert.equal(result.journey.length, 1);
  const serialized = JSON.stringify(result);
  for (const secret of ['private@example', 'secret-phone', 'secret-token', 'secret-click', 'other-private-id', 'primary_email']) assert.equal(serialized.includes(secret), false);
});
test('malformed rows and identifier objects do not crash the projection or inflate sessions', () => {
  const result = buildJourneyEvidence({ ...input(), rows: [null, { ...rows[0], source_record_id: {} }, { ...rows[0], web_session_id: {}, source: {} }] });
  assert.equal(result.diagnostics.invalidRecords, 2);
  assert.equal(result.counts.sessions, 0); assert.equal(result.counts.pageViews, 1);
  assert.equal(journeyPage('/profile/9876543210'), '/profile/[redacted]');
});
