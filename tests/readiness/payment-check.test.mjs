import { test } from 'node:test';
import assert from 'node:assert/strict';

import { batchLabel, interestText, orderBatches, duplicateHints, looksLikeOwnBusiness, moneyText, sortForChecking, suggestedAmount } from '../../lib/payment-check.ts';

const person = (o) => ({
  leadId: o.leadId, personId: o.personId ?? null, name: o.name, stage: 'payment_pending', courseId: null, courseName: null,
  value: o.value ?? null, currency: o.currency ?? 'INR', channel: null, daysWaiting: o.days ?? 0, lastInbound: null,
  saysPaid: Boolean(o.saysPaid), attempts: o.attempts ?? [],
});

test('“Younita Pandey” and “younita005” are flagged; already-merged people say “same person”', () => {
  const a = person({ leadId: 'a', name: 'Younita Pandey' });
  const b = person({ leadId: 'b', name: 'younita005' });
  const c = person({ leadId: 'c', name: 'Sanika Godbole' });
  const hints = duplicateHints([a, b, c]);
  assert.ok(hints.some((h) => h.leadId === 'a' && h.otherLeadId === 'b' && !h.samePerson));
  assert.equal(hints.some((h) => h.leadId === 'c' || h.otherLeadId === 'c'), false);
  const merged = duplicateHints([{ ...a, personId: 'p1' }, { ...b, personId: 'p1' }]);
  assert.ok(merged.every((h) => h.samePerson));
});

test('short first names never match by accident', () => {
  assert.equal(duplicateHints([person({ leadId: 'a', name: 'Riya S' }), person({ leadId: 'b', name: 'riyaz_yoga' })]).length, 0);
});

test('the business’s own number is spotted', () => {
  assert.equal(looksLikeOwnBusiness('Yogakulam Academy International', 'Yogakulam Academy'), true);
  assert.equal(looksLikeOwnBusiness('Padmavathy', 'Yogakulam Academy'), false);
  assert.equal(looksLikeOwnBusiness('Anyone', null), false);
  assert.equal(looksLikeOwnBusiness('Yogakulam Academy International', ['Demo Org', 'Yogakulam Academy']), true);
});

test('says paid first, then a checkout, then longest waiting', () => {
  const order = sortForChecking([
    person({ leadId: 'old', name: 'Old', days: 37 }),
    person({ leadId: 'checkout', name: 'C', days: 2, attempts: [{ id: 'x', amount: 20000, currency: 'INR', provider: 'direct_upi', kind: 'full', createdAt: '2026-11-23' }] }),
    person({ leadId: 'paid', name: 'P', days: 6, saysPaid: true }),
  ]).map((p) => p.leadId);
  assert.deepEqual(order, ['paid', 'checkout', 'old']);
});

test('the amount is filled from the biggest checkout, with the matching method', () => {
  const g = suggestedAmount(person({ leadId: 'r', name: 'R', attempts: [
    { id: 's', amount: 200, currency: 'USD', provider: 'paypal', kind: 'deposit', createdAt: '2026-11-12' },
    { id: 'f', amount: 2490, currency: 'USD', provider: 'paypal', kind: 'full', createdAt: '2026-11-12' },
  ] }));
  assert.deepEqual(g, { amount: 2490, currency: 'USD', checkoutId: 'f', method: 'paypal' });
  const mixed = suggestedAmount(person({ leadId: 'm', name: 'M', attempts: [
    { id: 'inr', amount: 6000, currency: 'INR', provider: 'direct_upi', kind: 'other', createdAt: '2026-11-11' },
    { id: 'usd', amount: 2490, currency: 'USD', provider: 'paypal', kind: 'full', createdAt: '2026-11-12' },
  ] }));
  assert.equal(mixed.checkoutId, 'usd');
  assert.equal(suggestedAmount(person({ leadId: 'n', name: 'N', value: 30000 })).checkoutId, null);
  assert.equal(moneyText(25000, 'INR'), '₹25,000');
  assert.equal(moneyText(2490, 'USD'), '$2,490');
});

test("past batches stay choosable: upcoming soonest first, then past newest first, marked started", () => {
  const rows = [
    { id: "a", course_id: "c", start_date: "2026-01-10", location: "Mysore" },
    { id: "b", course_id: "c", start_date: "2026-12-01", location: null },
    { id: "d", course_id: "c", start_date: "2026-11-30", location: "Goa" },
    { id: "e", course_id: "c", start_date: "2025-06-01", location: "" },
  ];
  assert.deepEqual(orderBatches(rows, "2026-11-25").map((r) => r.id), ["d", "b", "a", "e"]);
  assert.match(batchLabel(rows[0], "2026-11-25"), /Jan 2026 · Mysore \(started\)$/);
  assert.doesNotMatch(batchLabel(rows[1], "2026-11-25"), /started/);
});

test("Paid can enrol in several courses from one payment", async () => {
  const fs = await import("node:fs");
  const action = fs.readFileSync(new URL("../../app/admissions/payment-check-actions.ts", import.meta.url), "utf8");
  assert.match(action, /form\.getAll\("course_id"\)/);
  assert.match(action, /p_checkout_payment_id: i === 0 \? checkoutId : null/);
  const queue = fs.readFileSync(new URL("../../components/admissions/payment-check-queue.tsx", import.meta.url), "utf8");
  assert.match(queue, /\+ Add another course/);
  assert.match(queue, /toast\.success/);
  const data = fs.readFileSync(new URL("../../lib/payment-check-data.ts", import.meta.url), "utf8");
  assert.doesNotMatch(data, /\.gte\('start_date'/);
});

test("Interested in pill: main course first, two names then +N more, falls back to the lead's course", () => {
  assert.equal(interestText({ interests: ["200h TTC"], courseName: "200h TTC" }), "200h TTC");
  assert.equal(interestText({ interests: ["A", "B", "C"], courseName: null }), "A, B +1 more");
  assert.equal(interestText({ interests: [], courseName: "Prenatal" }), "Prenatal");
  assert.equal(interestText({ interests: [], courseName: null }), null);
});
