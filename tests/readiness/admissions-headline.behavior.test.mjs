import test from 'node:test';
import assert from 'node:assert/strict';
import { admissionsHeadline, focusBatch } from '../../lib/admissions-headline.ts';

const text = (p) => p.map((x) => x.text).join('');
const NOW = new Date('2026-11-20T12:00:00Z');

test('the batch that matters: soonest 30 days, most interested', () => {
  const b = focusBatch([
    { name: 'Online Prenatal', startDate: '2026-11-21', interested: 38, ready: 7 },
    { name: '85-Hour Prenatal', startDate: '2026-12-01', interested: 240, ready: 23 },
    { name: 'Far away', startDate: '2027-03-01', interested: 900, ready: 1 },
    { name: 'Past', startDate: '2026-11-01', interested: 999, ready: 1 },
  ], NOW);
  assert.equal(b.name, '85-Hour Prenatal');
  assert.equal(b.days, 11);
});

test('one sentence with real numbers', () => {
  const t = text(admissionsHeadline({ saysPaid: 3, paymentPending: 13, paymentMonthPlus: 7, batch: { name: '85-Hour Prenatal & Postnatal TTC', startDate: '2026-12-01', interested: 240, ready: 23, days: 11 } }));
  assert.equal(t, "3 say they've paid but nothing is recorded, 13 are at Payment pending (7 for a month or more) and the 85-Hour Prenatal & Postnatal TTC batch starts in 11 days with 240 interested and 23 ready to pay.");
});

test('quiet day', () => {
  assert.equal(text(admissionsHeadline({ saysPaid: 0, paymentPending: 0, paymentMonthPlus: 0, batch: null })), 'Nothing urgent in admissions right now.');
});
