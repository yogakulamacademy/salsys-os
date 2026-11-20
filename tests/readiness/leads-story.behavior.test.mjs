import test from 'node:test';
import assert from 'node:assert/strict';
import { leadsStory, biggestGap } from '../../lib/leads-story.ts';

const stages = { new: 89, contacted: 1, engaged: 1048, qualified: 67, high_intent: 104, payment_pending: 13, closed_won: 2, enrolled: 1, not_now: 55, lost: 14 };
const text = (parts) => parts.map((p) => p.text).join('');

test('the story says what matters with real numbers', () => {
  const t = text(leadsStory({ all: 1394, unassigned: 1372, waiting: 48, stages }));
  assert.match(t, /^1,394 leads\./);
  assert.match(t, /1,048 are talking to you but haven't said which course or when, so only 187 \(13%\) have reached Qualified or beyond\./);
  assert.match(t, /48 are waiting for a reply and 1,372 have no owner\.$/);
});

test('no ownership line when most leads have an owner; nothing invented without counts', () => {
  const t = text(leadsStory({ all: 100, unassigned: 10, waiting: 0, stages: null }));
  assert.equal(t, '100 leads.');
});

test('the big gap is named only when it stands out', () => {
  assert.equal(biggestGap(stages).from, 'Engaged');
  assert.equal(biggestGap({ engaged: 10, qualified: 8 }), null);
  assert.equal(biggestGap(null), null);
});
