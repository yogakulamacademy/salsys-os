import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { contactOutcome, defaultNextDays, followUpDue, isCallAnswer, stageAfterCall } from '../../lib/log-call.ts';

test('each answer moves the stage forward only', () => {
  assert.equal(stageAfterCall('interested', 'new'), 'engaged');
  assert.equal(stageAfterCall('interested', 'high_intent'), null);
  assert.equal(stageAfterCall('will_pay', 'engaged'), 'payment_pending');
  assert.equal(stageAfterCall('paid', 'not_now'), 'payment_pending');
  assert.equal(stageAfterCall('paid', 'payment_pending'), null);
  assert.equal(stageAfterCall('will_pay', 'closed_won'), null);
  assert.equal(stageAfterCall('not_now', 'enrolled'), null);
  assert.equal(stageAfterCall('not_now', 'engaged'), 'not_now');
  assert.equal(stageAfterCall('no_answer', 'new'), null);
  assert.equal(stageAfterCall('wrong_number', 'new'), null);
});

test('outcomes, default follow-ups and the 10:00 IST due time', () => {
  assert.equal(contactOutcome('no_answer'), 'no_answer');
  assert.equal(contactOutcome('wrong_number'), 'other');
  assert.equal(contactOutcome('will_pay'), 'connected');
  assert.equal(defaultNextDays('no_answer'), 1);
  assert.equal(defaultNextDays('wrong_number'), 0);
  assert.equal(followUpDue(3, new Date('2026-11-25T08:00:00Z')).toISOString(), '2026-11-28T04:30:00.000Z');
  assert.ok(isCallAnswer('paid'));
  assert.ok(!isCallAnswer('maybe'));
});

test('Log a call is wired into the Inbox and the lead page; nothing is sent', () => {
  const read = (p) => fs.readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
  const action = read('app/leads/log-call-action.ts');
  for (const rpc of ['log_lead_contact', 'set_lead_stage', 'create_followup_task']) assert.ok(action.includes(rpc), rpc);
  assert.doesNotMatch(action, /send|whatsapp|instagram/i);
  assert.match(read('components/inbox-quick-actions.tsx'), /<LogCallPanel compact/);
  assert.match(read('components/inbox-quick-actions.tsx'), /onClick=\{rememberCall\}/);
  assert.match(read('app/leads/[id]/page.tsx'), /<LogCallPanel leadName=\{lead\.name\}/);
});
