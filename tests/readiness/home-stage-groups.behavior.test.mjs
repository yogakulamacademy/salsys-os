import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { groupHomePipelineStages, progressedShare } from '../../lib/home-stage-groups.ts';

const byId = (counts) => Object.fromEntries(groupHomePipelineStages(counts).map((group) => [group.id, group.value]));

test('every real stage is its own row, so numbers match the Leads filter', () => {
  const groups = byId({ new: 81, contacted: 1, engaged: 1260, qualified: 4, high_intent: 13, payment_pending: 9, enrolled: 1, not_now: 6, nurture: 2 });
  assert.deepEqual(groups, { new: 81, contacted: 1, engaged: 1260, qualified: 4, high_intent: 13, payment_pending: 9, enrolled: 1, not_now: 8 });
  const hrefs = Object.fromEntries(groupHomePipelineStages({ new: 0, contacted: 0, engaged: 0, qualified: 0, high_intent: 0, payment_pending: 0 }).map((g) => [g.id, g.href]));
  assert.equal(hrefs.engaged, '/leads?stage=engaged');
  assert.equal(hrefs.not_now, '/leads?stage=not_now&stage=nurture');
});

test('missing, negative or non-finite counts are treated as zero', () => {
  const groups = byId({ new: -3, contacted: Number.NaN, engaged: 4, qualified: 2, high_intent: 5, payment_pending: Infinity, enrolled: null });
  assert.deepEqual(groups, { new: 0, contacted: 0, engaged: 4, qualified: 2, high_intent: 5, payment_pending: 0, enrolled: 0, not_now: 0 });
});

test('progress share ignores parked leads', () => {
  const groups = groupHomePipelineStages({ new: 10, contacted: 10, engaged: 60, qualified: 10, high_intent: 5, payment_pending: 4, enrolled: 1, not_now: 500 });
  assert.equal(progressedShare(groups), 20);
  assert.equal(progressedShare(groupHomePipelineStages({ new: 0, contacted: 0, engaged: 0, qualified: 0, high_intent: 0, payment_pending: 0 })), null);
});

test('Home pipeline uses the one grouping and no ad-hoc stage sums', () => {
  const page = fs.readFileSync('app/home/page.tsx', 'utf8');
  assert.equal((page.match(/groupHomePipelineStages\(counts\)/g) || []).length, 1);
  assert.ok(page.includes('<PipelineHealthPanel groups={stageGroups}'));
  assert.ok(!page.includes('counts.contacted + counts.engaged'));
});
