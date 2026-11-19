import test from 'node:test';
import assert from 'node:assert/strict';
import { adsHealth, compactMoney, paymentsHealth, pipelineHeadline, repliesHealth, valuationHealth } from '../../lib/home-data-health.ts';

const now = new Date('2026-11-19T12:00:00Z');

test('payments: nothing to record is healthy; logged payments ask for verification', () => {
  assert.deepEqual([paymentsHealth({ paidCount: 0, toVerify: 0, activeEnrollments: 0 }).note, paymentsHealth({ paidCount: 0, toVerify: 0, activeEnrollments: 0 }).state], ['No enrolments yet', 'ok']);
  assert.deepEqual([paymentsHealth({ paidCount: 3, toVerify: 2, activeEnrollments: 5 }).note, paymentsHealth({ paidCount: 3, toVerify: 2, activeEnrollments: 5 }).state], ['2 to verify', 'warn']);
  assert.equal(paymentsHealth({ paidCount: 3, toVerify: 0, activeEnrollments: 5 }).note, '3 verified');
  assert.equal(paymentsHealth(null).state, 'bad');
});

test('values are judged against leads that named a course', () => {
  const v = valuationHealth({ valued: 214, eligible: 1377, withoutCourse: 1147 });
  assert.equal(v.note, '93% of leads with a course');
  assert.equal(v.state, 'ok');
  assert.match(v.hint, /1,147 open leads/);
  assert.equal(valuationHealth({ valued: 10, eligible: 100, withoutCourse: 50 }).state, 'warn');
});

test('replies: history sync is delayed, not missing', () => {
  assert.equal(repliesHealth({ echoLive: false, historyReplyAt: '2026-11-17T10:00:00Z' }, now).note, 'Synced 2d ago');
  assert.equal(repliesHealth({ echoLive: false, historyReplyAt: null }, now).state, 'bad');
  assert.equal(repliesHealth({ echoLive: true, historyReplyAt: null }, now).state, 'ok');
});

test('ads: names which provider is broken', () => {
  const h = adsHealth([
    { provider: 'Google', lastSuccessAt: '2026-10-07T06:38:00Z', latestStatus: 'failed' },
    { provider: 'Meta', lastSuccessAt: '2026-10-07T06:33:00Z', latestStatus: 'success' },
  ], now, 3);
  assert.equal(h.note, 'Google failing · Meta 43d old');
  assert.equal(h.state, 'bad');
  assert.equal(adsHealth([{ provider: 'Google', lastSuccessAt: '2026-11-19T05:00:00Z', latestStatus: 'success' }], now, 3).state, 'ok');
});

test('headline value shows the main currency with others as an add-on', () => {
  assert.equal(compactMoney(4520000, 'INR'), '₹45.2L');
  assert.equal(compactMoney(12500000, 'INR'), '₹1.3Cr');
  assert.equal(compactMoney(98000, 'INR'), '₹98,000');
  assert.equal(compactMoney(29500, 'USD'), '$29.5K');
  assert.deepEqual(pipelineHeadline([{ currency: 'USD', amount: 29500, opportunities: 29 }, { currency: 'INR', amount: 4520000, opportunities: 185 }]), { value: '₹45.2L', extra: '+ $29.5K' });
  assert.deepEqual(pipelineHeadline([]), { value: '—', extra: null });
});
