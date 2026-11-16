import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  MIN_INSIGHT_CONVERSATIONS,
  MIN_WINS_FOR_OUTCOME_LEARNING,
  analyzeConversations,
  isQuickButton,
  redactExample,
} from '../../lib/conversation-learning.ts';

let seq = 0;
function msg(conversationId, body, { direction = 'inbound', type = 'text', minutes = 0 } = {}) {
  seq += 1;
  return {
    conversationId,
    direction,
    body,
    messageType: type,
    createdAt: new Date(Date.UTC(2026, 9, 1, 14, 0, seq) + minutes * 60000).toISOString(),
  };
}

test('redaction removes phone numbers, emails, handles and links', () => {
  const out = redactExample('Call +91 98765 43210 or mail a.b@gmail.com, see https://x.y/z @someone');
  assert.ok(!/\d{5}/.test(out));
  assert.ok(!out.includes('gmail'));
  assert.ok(!out.includes('https'));
  assert.ok(!out.includes('@someone'));
  assert.match(out, /\[phone\]/);
  assert.ok(redactExample('x'.repeat(300)).length <= 120);
});

test('quick-reply button texts are counted but never used as examples', () => {
  assert.equal(isQuickButton('What is the course fee?'), true);
  assert.equal(isQuickButton('what is the fee for 500 hour?'), false);
  const messages = [];
  for (let i = 0; i < 4; i += 1) messages.push(msg(`q${i}`, 'What is the course fee?'));
  const result = analyzeConversations(messages);
  const fee = result.insights.find((i) => i.kind === 'question' && i.key === 'fee');
  assert.equal(fee.conversations, 4);
  assert.deepEqual(fee.examples, []);
  assert.equal(result.quickButtonShare, 1);
});

test('stall point is the last thing the lead said; fee stall is detected', () => {
  const messages = [];
  for (let i = 0; i < 3; i += 1) messages.push(msg(`s${i}`, 'Hi'), msg(`s${i}`, 'How much for the 200 hour course?'));
  for (let i = 0; i < 3; i += 1) messages.push(msg(`n${i}`, 'What is the fee?'), msg(`n${i}`, 'Not now, maybe next year'));
  const result = analyzeConversations(messages);
  const feeStall = result.insights.find((i) => i.kind === 'stall_point' && i.key === 'fee');
  const notNow = result.insights.find((i) => i.kind === 'stall_point' && i.key === 'not_now');
  assert.equal(feeStall.conversations, 3);
  assert.equal(notNow.conversations, 3);
});

test('insights below the minimum evidence are not reported', () => {
  const messages = [];
  for (let i = 0; i < MIN_INSIGHT_CONVERSATIONS - 1; i += 1) messages.push(msg(`d${i}`, 'Any discount?'));
  const result = analyzeConversations(messages);
  assert.equal(result.insights.some((i) => i.kind === 'offer_request'), false);
});

test('offer requests, objections and buying signals are separated', () => {
  const messages = [];
  for (let i = 0; i < 3; i += 1) {
    messages.push(msg(`o${i}`, 'Can I pay in installments?'));
    messages.push(msg(`p${i}`, 'The fees are too much for me'));
    messages.push(msg(`b${i}`, 'I would love to join the December batch'));
  }
  const result = analyzeConversations(messages);
  assert.ok(result.insights.find((i) => i.kind === 'offer_request' && i.key === 'installments'));
  assert.ok(result.insights.find((i) => i.kind === 'objection' && i.key === 'price'));
  assert.ok(result.insights.find((i) => i.kind === 'buying_signal' && i.key === 'ready_to_join'));
});

test('missing team replies and too few enrolments are reported as data gaps, not guesses', () => {
  const messages = [];
  for (let i = 0; i < 5; i += 1) messages.push(msg(`g${i}`, 'What is the fee?'));
  messages.push(msg('g0', 'Namaste, the fee is ...', { direction: 'outbound' }));
  const outcomes = new Map([['g0', 'won']]);
  const result = analyzeConversations(messages, { outcomes });
  assert.equal(result.conversationsWithTeamReply, 1);
  assert.equal(result.outcomeEvidence.won, 1);
  assert.equal(result.outcomeEvidence.enoughForOutcomeLearning, false);
  assert.ok(result.insights.find((i) => i.kind === 'data_gap' && i.key === 'team_replies_missing'));
  assert.ok(result.insights.find((i) => i.kind === 'data_gap' && i.key === 'outcomes_missing'));
  assert.equal(result.insights.some((i) => i.kind === 'outcome_driver'), false);
});

test('outcome learning only switches on with enough wins that have team replies', () => {
  const messages = [];
  const outcomes = new Map();
  for (let i = 0; i < MIN_WINS_FOR_OUTCOME_LEARNING; i += 1) {
    messages.push(msg(`w${i}`, 'Is there a payment plan?'), msg(`w${i}`, 'Yes, 50% to book', { direction: 'outbound' }));
    outcomes.set(`w${i}`, 'won');
  }
  const result = analyzeConversations(messages, { outcomes });
  assert.equal(result.outcomeEvidence.enoughForOutcomeLearning, true);
  assert.ok(result.insights.find((i) => i.kind === 'outcome_driver' && i.key === 'won_after_installments'));
});

test('timing insight reports start hours in the organization time zone', () => {
  const messages = [];
  for (let i = 0; i < 4; i += 1) messages.push(msg(`t${i}`, 'Hello'));
  const result = analyzeConversations(messages, { timeZone: 'Asia/Kolkata' });
  const timing = result.insights.find((i) => i.kind === 'timing');
  assert.match(timing.detail, /19:00/); // 14:00 UTC = 19:30 IST
});

test('migration keeps learning tenant-scoped and review-gated', () => {
  const sql = readFileSync(new URL('../../supabase/migrations/20261116150000_conversation_learning_v1.sql', import.meta.url), 'utf8');
  assert.match(sql, /enable row level security/);
  assert.match(sql, /is_organization_member\(organization_id\)/);
  assert.match(sql, /can_manage_organization\(organization_id\)/);
  assert.match(sql, /review_status = 'approved'/);
  assert.match(sql, /organization must match its run/);
  assert.doesNotMatch(sql, /grant (insert|delete)[^;]*to authenticated/i);
  assert.match(sql, /security_invoker = true/);
});

test('team tactics are reported as an early signal only with enough enrolments, and only when they beat the baseline', async () => {
  const { MIN_WINS_FOR_EARLY_SIGNAL } = await import('../../lib/conversation-learning.ts');
  const messages = [];
  const outcomes = new Map();
  for (let i = 0; i < 30; i += 1) {
    const offered = i < 15;
    messages.push(msg(`e${i}`, 'What is the fee?'));
    messages.push(msg(`e${i}`, offered ? 'Fee 25,000. Early-bird discount 20,000 valid till Friday' : 'Fee is 25,000', { direction: 'outbound' }));
    outcomes.set(`e${i}`, offered && i < MIN_WINS_FOR_EARLY_SIGNAL + 1 ? 'won' : 'open');
  }
  const result = analyzeConversations(messages, { outcomes });
  const offer = result.insights.find((i) => i.kind === 'outcome_driver' && i.key === 'tactic_offer');
  assert.ok(offer);
  assert.match(offer.detail, /Early signal/);
  assert.equal(result.insights.some((i) => i.key === 'tactic_call'), false);
});

test('migration records the learning source and builds the playbook per source', () => {
  const sql = readFileSync(new URL('../../supabase/migrations/20261116150000_conversation_learning_v1.sql', import.meta.url), 'utf8');
  assert.match(sql, /source text not null default 'crm_messages'/);
  assert.match(sql, /r2\.source = r\.source/);
});
