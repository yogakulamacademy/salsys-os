import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBehaviorStory, isBehaviorDetail } from '../../lib/marketing-behavior-detail.ts';
import { pageLabel } from '../../lib/marketing-web.ts';

const text = (parts) => parts.map((p) => p.text).join('');
const M = '/courses/mysore/';
const d = {
  days: 30, visits: 2734, multiPage: 790,
  moves: [
    { from: '/', to: '/courses.php', n: 129, sessions: 119 }, { from: '/courses.php', to: '/', n: 72, sessions: 64 },
    { from: '/', to: `${M}200-hour-yoga-teacher-training-in-mysore.php`, n: 64, sessions: 62 },
    { from: '/courses/bengaluru/200-hour-weekdays-yoga-teacher-training-in-bengaluru.php', to: '/courses/bengaluru/200-hour-weekend-yoga-teacher-training-in-bengaluru.php', n: 25, sessions: 22 },
    { from: `${M}100-hour-yoga-teacher-training-in-mysore.php`, to: `${M}200-hour-yoga-teacher-training-in-mysore.php`, n: 23, sessions: 18 },
    { from: `${M}200-hour-yoga-teacher-training-in-mysore.php`, to: `${M}300-hour-yoga-teacher-training-in-mysore.php`, n: 20, sessions: 17 },
  ],
  pages: [
    { path: '/', visits: 1205, price: 23, formStarted: 15, formSent: 9, contact: 0, dates: 0, enrol: 0, brochure: 0, faq: 0, media: 11, exits: 772 },
    { path: '/courses.php', visits: 250, price: 0, formStarted: 2, formSent: 2, contact: 0, dates: 0, enrol: 0, brochure: 0, faq: 0, media: 9, exits: 158 },
    { path: '/courses/online/online-face-yoga-teacher-training.php', visits: 227, price: 20, formStarted: 22, formSent: 23, contact: 0, dates: 0, enrol: 0, brochure: 2, faq: 2, media: 1, exits: 191 },
    { path: `${M}200-hour-yoga-teacher-training-in-mysore.php`, visits: 200, price: 27, formStarted: 12, formSent: 5, contact: 0, dates: 0, enrol: 0, brochure: 0, faq: 0, media: 6, exits: 112 },
  ],
};

test('how people move and what they do', () => {
  assert.ok(isBehaviorDetail(d));
  const s = buildBehaviorStory(d, pageLabel);
  assert.equal(text(s.headline), '790 of 2,734 visits (29%) looked at more than one page in the last 30 days. The most common move is the Home page → the all-courses list, and about half of those come straight back.');
  assert.deepEqual(s.actions.map((a) => a.id), ['bounce', 'compare', 'fees']);
  assert.match(s.actions[0].body, /^119 visits went from the Home page to the all-courses list, and 64 went straight back\./);
  assert.match(s.actions[1].body, /200-Hour Weekdays.*\(22\), 100-Hour YTT in Mysore → 200-Hour YTT in Mysore \(18\)/);
  assert.match(s.actions[2].title, /^200-Hour YTT in Mysore: fees checked/);
  assert.match(s.actions[2].body, /27 visits looked at the fees and 5 sent a form \(7 started one and gave up\)/);
  assert.equal(s.moves[0].back, 64);
  assert.ok(!s.moves.some((m) => m.from === 'All courses list' && m.to === 'Home page'));
  assert.deepEqual(s.signals.map((x) => x.id), ['leaves', 'best']);
  assert.match(s.signals[0].title, /^63% of visits to the all-courses list end there$/);
});
