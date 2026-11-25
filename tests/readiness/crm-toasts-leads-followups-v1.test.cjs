const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (p) => fs.readFileSync(path.join(__dirname, '../..', p), 'utf8');

test('lead detail and follow-ups forms save in place with toasts', () => {
  const lead = read('app/leads/[id]/page.tsx');
  for (const a of ['updateLeadStageInline.bind', 'createFollowUpInline.bind', 'logLeadContactInline.bind']) assert.ok(lead.includes(a), a);
  assert.doesNotMatch(lead, /<form action=\{(stageAction|followUpAction|contactAction)\}/);
  const fu = read('app/follow-ups/page.tsx');
  assert.doesNotMatch(fu, /<form[^>]*action=\{(completeFollowUpAction|snoozeFollowUpAction|confirmLostFromTaskAction|closeSettledTasksAction)\}/);
  assert.ok(read('app/follow-ups/inline-actions.ts').includes('asResult'));
});
