import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { groupHomePipelineStages } from '../../lib/home-stage-groups.ts';

const byId = (counts) => Object.fromEntries(groupHomePipelineStages(counts).map((group) => [group.id, group.value]));

test('Contacted combines contacted and engaged; High intent combines qualified and high_intent', () => {
  const groups = byId({ new: 81, contacted: 1, engaged: 1260, qualified: 0, high_intent: 0, payment_pending: 9, enrolled: 1 });
  assert.deepEqual(groups, { new: 81, contacted: 1261, high_intent: 0, payment_pending: 9, enrolled: 1 });
});

test('missing, negative or non-finite counts are treated as zero', () => {
  const groups = byId({ new: -3, contacted: Number.NaN, engaged: 4, qualified: 2, high_intent: 5, payment_pending: Infinity, enrolled: null });
  assert.deepEqual(groups, { new: 0, contacted: 4, high_intent: 7, payment_pending: 0, enrolled: 0 });
});

test('Home pipeline uses the one grouping and no ad-hoc stage sums', () => {
  const page = fs.readFileSync('app/home/page.tsx', 'utf8');
  assert.equal((page.match(/groupHomePipelineStages\(counts\)/g) || []).length, 1);
  assert.ok(page.includes('<PipelineHealthPanel groups={stageGroups} />'));
  assert.ok(!page.includes('{label:"Contacted",value:counts.contacted}'));
  assert.ok(!page.includes('counts.contacted + counts.engaged'));
});
