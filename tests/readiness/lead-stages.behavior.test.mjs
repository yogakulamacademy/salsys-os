import test from 'node:test';
import assert from 'node:assert/strict';
import { decideStageMove, parseStageAnswer, ruleBasedSignal, strongerSignal } from '../../lib/lead-stages.ts';

const now = new Date('2026-11-19T12:00:00Z');
const base = { confidence: 0.9, lastManualMoveAt: null, now };

test('stages: forward only', () => {
  assert.deepEqual(decideStageMove({ ...base, current: 'engaged', signal: 'high_intent' }), { action: 'move', to: 'high_intent' });
  assert.equal(decideStageMove({ ...base, current: 'high_intent', signal: 'engaged' }).action, 'none');
  assert.equal(decideStageMove({ ...base, current: 'qualified', signal: 'qualified' }).action, 'none');
});

test('stages: never touches won, enrolled, lost or duplicate leads', () => {
  for (const current of ['closed_won', 'enrolled', 'lost', 'unqualified', 'duplicate']) {
    assert.equal(decideStageMove({ ...base, current, signal: 'payment_pending' }).action, 'none');
  }
});

test('stages: not now is automatic, lost is only suggested', () => {
  assert.deepEqual(decideStageMove({ ...base, current: 'high_intent', signal: 'not_now' }), { action: 'move', to: 'not_now' });
  assert.deepEqual(decideStageMove({ ...base, current: 'engaged', signal: 'lost' }), { action: 'suggest_lost' });
  assert.equal(decideStageMove({ ...base, current: 'payment_pending', signal: 'not_now' }).action, 'none');
});

test('stages: parked leads come back when interest returns', () => {
  assert.deepEqual(decideStageMove({ ...base, current: 'not_now', signal: 'high_intent' }), { action: 'move', to: 'high_intent' });
  assert.deepEqual(decideStageMove({ ...base, current: 'nurture', signal: 'engaged' }), { action: 'move', to: 'engaged' });
});

test('stages: 7-day lock after a team move, except payment pending', () => {
  const recent = { ...base, lastManualMoveAt: '2026-11-15T12:00:00Z' };
  assert.equal(decideStageMove({ ...recent, current: 'engaged', signal: 'high_intent' }).action, 'none');
  assert.equal(decideStageMove({ ...recent, current: 'engaged', signal: 'lost' }).action, 'none');
  assert.deepEqual(decideStageMove({ ...recent, current: 'engaged', signal: 'payment_pending' }), { action: 'move', to: 'payment_pending' });
  const old = { ...base, lastManualMoveAt: '2026-11-10T12:00:00Z' };
  assert.deepEqual(decideStageMove({ ...old, current: 'engaged', signal: 'high_intent' }), { action: 'move', to: 'high_intent' });
});

test('stages: low confidence does nothing; AI can never set Won', () => {
  assert.equal(decideStageMove({ ...base, confidence: 0.5, current: 'new', signal: 'engaged' }).action, 'none');
  assert.equal(parseStageAnswer('{"stage":"closed_won","confidence":1,"evidence":"x"}'), null);
  assert.deepEqual(parseStageAnswer('{"stage":"high_intent","confidence":0.92,"evidence":"what is the fee?"}'), { stage: 'high_intent', confidence: 0.92, evidence: 'what is the fee?' });
  assert.equal(parseStageAnswer('nope'), null);
});

test('stages: rule signals and combining with the AI', () => {
  assert.equal(ruleBasedSignal({ inboundCount: 0, outboundCount: 2, hasMainCourse: true, hasPlan: false }), 'contacted');
  assert.equal(ruleBasedSignal({ inboundCount: 0, outboundCount: 0, hasMainCourse: false, hasPlan: false }), 'none');
  assert.equal(ruleBasedSignal({ inboundCount: 3, outboundCount: 2, hasMainCourse: true, hasPlan: true }), 'qualified');
  assert.equal(strongerSignal('high_intent', 'qualified'), 'high_intent');
  assert.equal(strongerSignal('engaged', 'qualified'), 'qualified');
  assert.equal(strongerSignal('not_now', 'qualified'), 'not_now');
  assert.equal(strongerSignal('none', 'contacted'), 'contacted');
});
