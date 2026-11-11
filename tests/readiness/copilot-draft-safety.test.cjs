'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers.cjs');

const {
  enforceLatestInboundSafety,
  inspectCopilotDraftCommitments,
} = load('lib/copilot-draft-safety.ts');

const low = {
  complexity: 'simple',
  risk: 'low',
  intent: 'knowledge_lookup',
  nextAction: 'reply',
  reason: 'Model says low risk',
};

test('G01: latest refund and double-charge dispute force complex human-only handoff', () => {
  for (const text of [
    'I need a refund now.',
    'I was charged twice. I want to dispute this.',
    'I still have not received the promised reimbursement.',
    'I want to file a formal complaint.',
    'My lawyer will take legal action about these payments.',
  ]) {
    const routed = enforceLatestInboundSafety(low, text);
    assert.equal(routed.risk, 'human_only', text);
    assert.equal(routed.nextAction, 'handoff', text);
    assert.equal(routed.complexity, 'complex', text);
  }
});

test('G01: policy questions and discounts elevate to review, not compulsory human-only', () => {
  for (const text of [
    'What is your refund policy?',
    'May I have a discount for the course?',
    'What is the payment confirmation procedure?',
    'Can the accommodation rules have an exception?',
  ]) {
    const routed = enforceLatestInboundSafety(low, text);
    assert.equal(routed.risk, 'review', text);
    assert.equal(routed.complexity, 'complex', text);
    assert.equal(routed.nextAction, 'reply', text);
  }
});

test('G01: neutral benign request and explicit no-complaint statement remain low', () => {
  for (const text of [
    'When does the next yoga class start?',
    'I have no complaints. What time is the class?',
    'I am not requesting a refund. Can you confirm class timings?',
  ]) {
    const routed = enforceLatestInboundSafety(low, text);
    assert.equal(routed.risk, 'low', text);
  }
});

test('G01: existing human-only and review decisions cannot be downgraded', () => {
  const humanOnly = { ...low, complexity: 'simple', risk: 'human_only', nextAction: 'reply' };
  const humanResult = enforceLatestInboundSafety(humanOnly, 'What time does class start?');
  assert.equal(humanResult.risk, 'human_only');
  assert.equal(humanResult.nextAction, 'handoff');
  assert.equal(humanResult.complexity, 'complex');
  const reviewed = enforceLatestInboundSafety({ ...low, risk: 'review' }, 'When does class begin?');
  assert.equal(reviewed.risk, 'review');
});

test('G02: evidence-free affirmative settlement and enrollment promises must be blocked', () => {
  for (const draft of [
    'Your payment has been confirmed.',
    'We have received your deposit.',
    'The payment was successfully processed.',
    'Your refund has been processed.',
    'The booking is confirmed.',
    'Your seat is reserved.',
    'Your accommodation is guaranteed.',
    'Your discount has been approved.',
    'We will waive your cancellation fee.',
    'Please wait. Your payment has been confirmed.',
  ]) {
    const decision = inspectCopilotDraftCommitments(draft);
    assert.equal(decision.ok, false, draft);
    assert.match(decision.error, /unsupported payment/);
  }
});

test('G02: neutral uncertainty, denials and conditional language are permitted', () => {
  for (const draft of [
    'We cannot confirm that the payment has arrived yet.',
    'Your payment has not been confirmed. Please ask our team to verify it.',
    'Please share the transaction reference so our team can check your payment.',
    'If your payment has been confirmed, please share the confirmation reference.',
    'The room availability needs checking before we promise a place.',
    'We cannot guarantee a discount or refund.',
  ]) {
    const decision = inspectCopilotDraftCommitments(draft);
    assert.equal(decision.ok, true, draft);
  }
});

test('G02: a denial in an earlier clause cannot hide an assertion later in the draft', () => {
  for (const draft of [
    "We cannot confirm your payment, but your seat is reserved.",
    "Payment requires verification. Your refund has been processed.",
    "If your payment has been confirmed, let us know; we have received your deposit.",
  ]) {
    assert.equal(inspectCopilotDraftCommitments(draft).ok, false, draft);
  }
});
