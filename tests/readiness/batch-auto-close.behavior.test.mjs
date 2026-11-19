import test from 'node:test';
import assert from 'node:assert/strict';
import { batchHasStarted, todayIn } from '../../lib/batch-auto-close.ts';

test('a batch closes from its start date (running or finished), in its own time zone', () => {
  // 19 Nov 18:40 UTC = 20 Nov 00:10 IST, when the daily job runs
  const now = new Date('2026-11-19T18:40:00Z');
  assert.equal(todayIn('Asia/Kolkata', now), '2026-11-20');
  assert.equal(batchHasStarted({ start_date: '2026-11-20', timezone: 'Asia/Kolkata' }, now), true);  // starts today: running
  assert.equal(batchHasStarted({ start_date: '2026-11-01', timezone: 'Asia/Kolkata' }, now), true);  // started earlier
  assert.equal(batchHasStarted({ start_date: '2026-11-21', timezone: 'Asia/Kolkata' }, now), false); // upcoming
  assert.equal(batchHasStarted({ start_date: '2026-11-20', timezone: 'America/New_York' }, now), false); // still 19 Nov there
  assert.equal(batchHasStarted({ start_date: '2026-11-20', timezone: null }, now), true);           // default India
  assert.equal(batchHasStarted({ start_date: null }, now), false);
  assert.equal(batchHasStarted({ start_date: 'soon' }, now), false);
});
