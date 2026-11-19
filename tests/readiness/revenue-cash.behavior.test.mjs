import test from 'node:test';
import assert from 'node:assert/strict';
import { outstanding, summarizeCash } from '../../lib/revenue-cash.ts';

const enr = (o) => ({ id: 'e', leadId: 'l', leadName: 'Asha', courseName: '200H', status: 'confirmed', total: 30000, currency: 'INR', dueDate: null, payments: [], ...o });

test('cash: outstanding counts verified and logged payments, ignores rejected and refunds', () => {
  assert.equal(outstanding(enr({ payments: [{ amount: 10000, status: 'paid', kind: 'deposit' }, { amount: 5000, status: 'pending', kind: 'balance' }, { amount: 9000, status: 'failed', kind: 'balance' }, { amount: 1000, status: 'refunded', kind: 'refund' }] })), 15000);
  assert.equal(outstanding(enr({ payments: [{ amount: 40000, status: 'paid', kind: 'full' }] })), 0);
  assert.equal(outstanding(enr({ total: null })), 0);
});

test('cash: collected this month, refunds and waiting for verification', () => {
  const s = summarizeCash([
    { amount: 20000, currency: 'INR', status: 'paid', kind: 'full', paidAt: '2026-11-03T10:00:00Z', teamLogged: true },
    { amount: 10000, currency: 'INR', status: 'paid', kind: 'deposit', paidAt: '2026-10-30T10:00:00Z', teamLogged: true },
    { amount: 2000, currency: 'INR', status: 'refunded', kind: 'refund', paidAt: '2026-11-10T10:00:00Z', teamLogged: false },
    { amount: 5000, currency: 'INR', status: 'pending', kind: 'balance', paidAt: '2026-11-18T10:00:00Z', teamLogged: true },
    { amount: 4186, currency: 'USD', status: 'pending', kind: 'full', paidAt: null, teamLogged: false },
    { amount: 950, currency: 'usd', status: 'paid', kind: 'full', paidAt: '2026-11-05T00:00:00Z', teamLogged: false },
  ], [], '2026-11-19');
  const inr = s.byCurrency.find((r) => r.currency === 'INR');
  const usd = s.byCurrency.find((r) => r.currency === 'USD');
  assert.equal(s.byCurrency[0].currency, 'INR');
  assert.equal(inr.collectedThisMonth, 20000);
  assert.equal(inr.refundedThisMonth, 2000);
  assert.equal(inr.awaitingVerification, 5000);
  assert.equal(usd.collectedThisMonth, 950);
  assert.equal(usd.awaitingVerification, 0, 'old payment links are not logged payments');
});

test('cash: due buckets, overdue and inactive enrolments', () => {
  const s = summarizeCash([], [
    enr({ id: 'late', dueDate: '2026-11-09', payments: [{ amount: 10000, status: 'paid', kind: 'deposit' }] }),
    enr({ id: 'soon', dueDate: '2026-12-19' }),
    enr({ id: 'mid', dueDate: '2027-01-10' }),
    enr({ id: 'far', dueDate: '2027-02-15' }),
    enr({ id: 'later', dueDate: '2027-06-01' }),
    enr({ id: 'nodate', dueDate: null }),
    enr({ id: 'cancelled', status: 'cancelled', dueDate: '2026-11-01' }),
  ], '2026-11-19');
  const r = s.byCurrency[0];
  assert.equal(r.overdue, 20000);
  assert.equal(r.due30, 30000);
  assert.equal(r.due60, 30000);
  assert.equal(r.due90, 30000);
  assert.equal(r.dueLater, 60000);
  assert.deepEqual(s.overdueItems.map((i) => [i.enrollmentId, i.daysLate]), [['late', 10]]);
  assert.equal(s.upcomingItems[0].enrollmentId, 'soon');
  assert.equal(s.upcomingItems.at(-1).enrollmentId, 'nodate');
});
