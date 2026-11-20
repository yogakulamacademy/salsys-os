import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPersonTimeline, personSummary, quote } from '../../lib/person-story.ts';

const NOW = new Date('2026-11-20T12:00:00Z');

test('summary says what they want, what they did and where things stand', () => {
  const s = personSummary(
    { name: 'Klil', course: '100-Hour Yoga Teacher Training', location: 'Mysore', month: 'end of December', mode: null, country: 'Germany', countryLikely: true, stage: 'qualified' },
    { pagesViewed: 9, formAt: '2026-11-18T11:01:00Z', lastInboundAt: '2026-11-18T11:01:00Z', lastOutboundAt: null, now: NOW },
  );
  assert.equal(s, 'Wants the 100-Hour Yoga Teacher Training in Mysore around end of December. Looked at 9 pages on your site and filled the contact form on 18 Nov. Nobody has replied for 2 days.');
});

test('no course yet, nothing invented', () => {
  const s = personSummary(
    { name: 'X', course: null, location: null, month: null, mode: null, country: null, countryLikely: false, stage: 'engaged' },
    { pagesViewed: 0, formAt: null, lastInboundAt: null, lastOutboundAt: '2026-11-19T10:00:00Z', now: NOW },
  );
  assert.equal(s, "Hasn't said which course yet. You last wrote 1 day ago.");
});

test('timeline: visits per day, form, messages, stage changes, waiting', () => {
  const t = buildPersonTimeline({
    pageViews: Array.from({ length: 9 }, (_, i) => ({ at: `2026-11-18T10:5${i}:00Z`, path: i % 2 ? '/courses/mysore/x.php' : '/' })),
    sessions: [{ at: '2026-11-18T10:50:00Z', source: 'google' }],
    forms: [{ at: '2026-11-18T11:01:00Z', name: 'contact', message: 'I will be in Mysore end of December' }],
    messages: [{ at: '2026-11-18T11:01:00Z', direction: 'inbound', body: 'I will be in Mysore end of December' }],
    stageChanges: [{ at: '2026-11-19T08:00:00Z', from: 'new', to: 'qualified', by: 'ai', reason: 'She named a course and a month' }],
    payments: [],
    now: NOW,
  });
  assert.deepEqual(t.map((i) => i.title), ['Visited 9 pages', 'Filled the contact form', 'First message', 'AI moved them to Qualified', 'No reply yet']);
  assert.equal(t[0].detail, 'Came from Google · course pages');
  assert.equal(t.at(-1).detail, 'Waiting 2 days');
});

test('quotes are short and Instagram notes get words', () => {
  assert.equal(quote('[Instagram ephemeral message]'), 'Sent a disappearing message');
  assert.equal(quote('a'.repeat(200)).length, 112);
  assert.equal(quote('  '), null);
});
