const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function load(file) {
  const result = {};
  const code = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '../..', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('exports', code)(result);
  return result;
}
const { nextJourneyAction, selectJourneyView, defaultJourneyFilters, journeyReadAge } = load('lib/journey-workspace.ts');
const { createLatestReadGuard } = load('lib/latest-read.ts');
const now = Date.parse('2026-11-02T10:00:00Z');
const context = changes => ({ leadId: 'lead-a', stage: 'qualified', owner: 'Reviewer', readAt: new Date(now).toISOString(), tasksState: 'empty', ...changes });
const event = changes => ({ key: 'page-a', at: '2026-11-02T09:00:00Z', type: 'page_view', title: 'page view', kind: 'website', evidence: 'Observed', phase: 'after', session: 's1', source: 'Google', page: '/course', ...changes });
const evidence = changes => ({ leadId: 'lead-a', state: 'available', policy: 'unknown', through: new Date(now).toISOString(), partial: false, events: [event({}), event({ key: 'page-b', session: 's2', at: '2026-11-01T10:00:00Z' }), event({ key: 'record', kind: 'business', evidence: 'Recorded', type: 'lead_created', title: 'lead created', phase: 'before', source: 'Business record', page: null, session: null })], ...changes });

test('terminal outcomes suppress acquisition reminders, including overdue and unassigned records', () => {
  for (const stage of ['enrolled', 'closed_won', 'lost', 'unqualified', 'duplicate']) assert.equal(nextJourneyAction(evidence(), context({ stage, owner: '', nextFollowupAt: '2026-11-01T10:00:00Z' }), now).code, 'review');
  assert.equal(nextJourneyAction(evidence(), context({ owner: '' }), now).code, 'owner');
  assert.equal(nextJourneyAction(evidence(), context({ owner: 'Unassigned' }), now).code, 'owner');
  assert.equal(nextJourneyAction(evidence(), context({ stage: 'unknown' }), now).code, 'review');
});
test('service reminders choose the earliest loaded commitment without inventing payment or intent', () => {
  const action = nextJourneyAction(evidence(), context({ nextFollowupAt: '2026-11-03T10:00:00Z', tasksState: 'available', tasks: [{ id: 'done', title: 'done', status: 'completed', due_at: '2020-01-01T00:00:00Z' }, { id: 'due', title: 'Review', status: 'snoozed', due_at: '2026-11-02T10:00:00Z' }] }), now);
  assert.equal(action.title, 'Review the overdue follow-up');
  assert.equal(Date.parse(action.dueAt), now);
  assert.equal(nextJourneyAction(evidence(), context({ stage: 'payment_pending' }), now).code, 'payments');
});
test('paused stages, unavailable tasks and ambiguous dates cannot imply a missing commitment', () => {
  assert.equal(nextJourneyAction(evidence(), context({ stage: 'not_now' }), now).title, 'Respect the recorded pause');
  assert.equal(nextJourneyAction(evidence(), context({ tasksState: 'unavailable' }), now).code, 'review');
  assert.equal(nextJourneyAction(evidence(), context({ tasksState: undefined }), now).code, 'review');
  for (const date of ['2026-02-30T10:00:00Z', '2026-11-02T09:00:00', 'nonsense']) assert.equal(nextJourneyAction(evidence(), context({ nextFollowupAt: date }), now).title, 'Review the follow-up date');
});
test('stale, failed, future or mismatched reads cannot drive a current action', () => {
  assert.equal(nextJourneyAction(evidence(), context(), now + 300_001).code, 'refresh');
  assert.equal(nextJourneyAction(evidence(), context(), now, true).code, 'refresh');
  assert.equal(nextJourneyAction(evidence(), context({ readAt: '2026-11-03T00:00:00Z' }), now).code, 'refresh');
  assert.equal(nextJourneyAction(evidence(), context({ leadId: 'other' }), now), null);
  assert.equal(nextJourneyAction(evidence(), undefined, now), null);
});
test('CRM service commitments are independent of website policy, history and inferred scores', () => {
  const crm = context({ nextFollowupAt: '2026-11-01T00:00:00Z' });
  const expected = nextJourneyAction(evidence(), crm, now);
  for (const changes of [{ events: [] }, { state: 'restricted', events: [] }, { partial: true, policy: 'permitted' }]) assert.deepEqual(nextJourneyAction(evidence(changes), crm, now), expected);
  assert.doesNotMatch(JSON.stringify(expected), /high intent|probability|verified payment/i);
});
test('combined filters and sort are deterministic and do not mutate the projection', () => {
  const data = evidence(), original = JSON.stringify(data);
  const filters = { ...defaultJourneyFilters, kind: 'website', source: 'Google', search: 'COURSE', order: 'oldest' };
  const view = selectJourneyView(data, filters);
  assert.deepEqual(view.events.map(e => e.key), ['page-b', 'page-a']);
  assert.equal(view.sessions, 2); assert.equal(view.pageViews, 2);
  assert.deepEqual(view.pages, [{ path: '/course', views: 2, sessions: 2 }]);
  assert.equal(JSON.stringify(data), original);
  assert.equal(selectJourneyView(data, { ...filters, phase: 'before' }).events.length, 0);
});
test('page drill-down preserves the view summary and unique session units', () => {
  const data = evidence({ events: [event({}), event({ key: 'page-b', page: '/fees' }), event({ key: 'form', type: 'form_submit', page: '/fees' })] });
  const view = selectJourneyView(data, { ...defaultJourneyFilters, page: '/fees' });
  assert.equal(view.events.length, 2); assert.equal(view.pageViews, 1); assert.equal(view.sessions, 1);
  assert.equal(view.pages.length, 2);
  assert.equal(selectJourneyView(data, { ...defaultJourneyFilters, search: 'nothing' }).pages.length, 0);
});
test('restricted history cannot leak summaries, source options or injected rows; private paths are not promoted', () => {
  assert.deepEqual(selectJourneyView(evidence({ state: 'restricted' }), defaultJourneyFilters), { events: [], pages: [], sources: [], sessions: 0, pageViews: 0 });
  const data = evidence({ events: [event({ page: '[Private page]' }), event({ key: 'other', page: '/[redacted]' })] });
  assert.equal(selectJourneyView(data, defaultJourneyFilters).pages.length, 0);
});
test('seven-day filter anchors to the disclosed read cutoff, never creates lifetime claims', () => {
  const view = selectJourneyView(evidence({ events: [event({ at: '2026-10-01T10:00:00Z' }), event({ key: 'recent', at: '2026-11-01T10:00:00Z' })] }), { ...defaultJourneyFilters, range: '7d' });
  assert.deepEqual(view.events.map(e => e.key), ['recent']);
  assert.equal(journeyReadAge('invalid', now), 'Read time unavailable');
  assert.equal(journeyReadAge(new Date(now).toISOString(), now + 120_000), 'Read 2 min ago');
});
test('latest-read guard rejects late A→B→A responses and unmounted requests even if transport ignores abort', () => {
  const gate = createLatestReadGuard();
  const a1 = gate.start(), b = gate.start(), a2 = gate.start();
  assert.equal(a1.signal.aborted, true); assert.equal(b.isCurrent(), false);
  assert.equal(a1.isCurrent(), false); assert.equal(a2.isCurrent(), true);
  gate.invalidate(); assert.equal(a2.isCurrent(), false); assert.equal(a2.signal.aborted, true);
  const retry = gate.start(); retry.cancel(); assert.equal(retry.isCurrent(), false);
});
