import test from 'node:test';
import assert from 'node:assert/strict';

import { buildInterestProfile, topicsInText, pageLabel } from '../../lib/interest-profile.ts';

const NOW = new Date('2026-11-20T12:00:00Z');
const at = (daysAgo) => new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString();
const course = { courseId: 'c-mys-100', courseName: '100 Hour YTT Mysore', path: '/courses/mysore/100-hour-ytt.php' };

test('topics come from what the person wrote', () => {
  assert.deepEqual(topicsInText('What is the fee and when is the next batch?').sort(), ['dates', 'fees']);
  assert.ok(topicsInText('any scholarship available?').includes('discount'));
  assert.ok(topicsInText('Is accommodation included?').includes('accommodation'));
  assert.deepEqual(topicsInText(''), []);
  assert.deepEqual(topicsInText(null), []);
});

test('page names read like words when no course matches', () => {
  assert.equal(pageLabel('/courses/kerala/200-hour-yoga-ttc.php'), '200 hour yoga ttc');
  assert.equal(pageLabel('/'), 'Home page');
});

test('a person who read prices, clicked enrol and asked fees this week is hot, with reasons', () => {
  const p = buildInterestProfile({
    now: NOW,
    coursePages: [course],
    sessions: [{ startedAt: at(12) }, { startedAt: at(1), country: 'IN', source: 'instagram' }],
    events: [
      { name: 'web.page_viewed', at: at(1), props: { pagePath: '/courses/mysore/100-hour-ytt.php' } },
      { name: 'web.page_viewed', at: at(1), props: { pagePath: '/courses/mysore/100-hour-ytt.php' } },
      { name: 'web.page_viewed', at: at(1), props: { pagePath: '/enroll.php' } },
      { name: 'web.pricing_viewed', at: at(1), props: { pagePath: '/courses/mysore/100-hour-ytt.php' } },
      { name: 'web.cta_clicked', at: at(1), props: { cta_kind: 'enrol' } },
      { name: 'web.engaged_time', at: at(1), props: { engaged_seconds: 240, max_scroll_percent: 90 } },
      { name: 'web.media_interacted', at: at(1), props: { media: 'video', action: 'complete' } },
    ],
    messages: [{ direction: 'inbound', at: at(2), body: 'What is the fee for the December batch?' }],
  });
  assert.equal(p.interestBand, 'hot');
  assert.ok(p.interestScore >= 60 && p.interestScore <= 100);
  assert.equal(p.courses[0].name, '100 Hour YTT Mysore');
  assert.equal(p.courses[0].priceSeen, true);
  assert.equal(p.returnedAfterDays, 11);
  assert.equal(p.readingMinutes, 4);
  assert.equal(p.maxScrollPercent, 90);
  assert.ok(p.reasons.length > 0 && p.reasons.length <= 6);
  assert.ok(p.reasons.every((r, i, a) => i === 0 || a[i - 1].points >= r.points), 'reasons sorted by weight');
  assert.ok(p.topics.some((t) => t.key === 'fees'));
});

test('no data means cold and nothing invented', () => {
  const p = buildInterestProfile({ now: NOW, coursePages: [], sessions: [], events: [], messages: [] });
  assert.equal(p.hasWebsiteData, false);
  assert.equal(p.interestScore, 0);
  assert.equal(p.interestBand, 'cold');
  assert.deepEqual(p.courses, []);
});

test('new kinds of activity still count, without a code change', () => {
  const p = buildInterestProfile({
    now: NOW, coursePages: [], sessions: [], messages: [],
    events: [{ name: 'web.quiz_completed', at: at(1) }, { name: 'web.quiz_completed', at: at(1) }],
  });
  assert.equal(p.otherActivity['web.quiz_completed'], 2);
  assert.ok(p.reasons.some((r) => r.text === 'Other website activity'));
});

test('long silence lowers the score; bad timestamps are ignored', () => {
  const p = buildInterestProfile({
    now: NOW, coursePages: [], sessions: [],
    events: [{ name: 'web.page_viewed', at: at(60), props: { pagePath: '/' } }, { name: 'web.page_viewed', at: 'nope' }],
    messages: [{ direction: 'inbound', at: at(60), body: 'hi' }],
  });
  assert.equal(p.pagesViewed, 1);
  assert.equal(p.interestScore, 0);
});
