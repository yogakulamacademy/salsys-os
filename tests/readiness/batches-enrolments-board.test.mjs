import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildBatchBoard, boardView, withEdit } from '../../lib/batches-board.ts';
import { buildEnrolBoard, moneyTotal, suggestBatch } from '../../lib/enrolments-board.ts';

const fx = JSON.parse(readFileSync(new URL('./fixtures/operations-story-yogakulam.json', import.meta.url), 'utf8'));
const text = (parts) => parts.map((p) => p.text).join('');
const inputs = fx.batches.map((b) => ({
  id: b.id, courseId: b.courseId, course: b.course, location: b.location, mode: b.mode, start: b.start, end: b.end,
  capacity: b.capacity, seatsRemaining: b.seatsRemaining, enrolled: b.enrolled,
  fee: b.hasPrice ? 1500 : null, currency: b.hasPrice ? 'USD' : 'INR', quotePrice: null, open: b.open, note: null,
}));
const warm = Object.fromEntries(fx.batches.map((b) => [b.id, { place: b.warmPlace, course: b.warmCourse }]));
const board = buildBatchBoard({ today: fx.today, batches: inputs, warm, noBatch: 8 });

test('batches board: headline, ranked actions and focus links', () => {
  assert.match(text(board.headline), /^\d+ batches start in the next 60 days, and none of them has a seat count\./);
  assert.match(text(board.headline), /Start with 85-Hour Prenatal & Postnatal TTC in Mysore on 1 Dec: 53 warm people are asking about it\./);
  assert.deepEqual(board.ranks.map((r) => r.id), ['first', 'cluster', 'assign']);
  assert.equal(board.ranks[0].actions[0].href, `/course-management?focus=${fx.batches[0].id}`);
  assert.match(board.ranks[1].title, /^Set seats for the \d+ batches starting 7 Dec$/);
  assert.ok(board.places.includes('Online') && board.places.at(-1) === 'Online');
  assert.ok(board.signals.some((s) => s.id === 'quote'));
});

test('batches board: filters, grouping and unsaved edits', () => {
  const all = boardView(board, { days: 60, place: 'all', missingSeats: false, missingFee: false, waiting: false });
  assert.equal(all.groups.reduce((t, g) => t + g.batches.length, 0), all.count);
  assert.equal(all.groups[0].course, '85-Hour Prenatal & Postnatal Yoga TTC');
  const online = boardView(board, { days: 60, place: 'Online', missingSeats: false, missingFee: false, waiting: false });
  assert.ok(online.groups.every((g) => g.batches.every((b) => b.online)));
  const id = fx.batches[0].id;
  const edited = boardView(board, { days: 60, place: 'all', missingSeats: true, missingFee: false, waiting: false }, { [id]: { capacity: 20 } });
  assert.ok(!edited.groups.some((g) => g.batches.some((b) => b.id === id)));
  assert.equal(edited.kpis[1].value.startsWith('1 of'), true);
  assert.equal(withEdit(board.batches[0], { open: false }).open, false);
});

const batches = [
  { id: 'b1', courseId: 'c1', start: '2026-12-10', end: null, place: 'Online', capacity: 1, enrolled: 1, open: true },
  { id: 'b2', courseId: 'c1', start: '2026-12-21', end: null, place: 'Online', capacity: null, enrolled: 0, open: true },
  { id: 'b0', courseId: 'c1', start: '2026-11-01', end: null, place: 'Online', capacity: null, enrolled: 0, open: true },
];
const e = (id, over = {}) => ({ id, leadId: 'l' + id, leadName: 'Asha', courseId: 'c1', courseName: 'Online Prenatal', batchId: null, status: 'confirmed', totalValue: 17500, currency: 'INR', createdAt: '2026-11-25T10:00:00Z', ...over });

test('enrolments board: suggests the next batch with room and tells the story', () => {
  assert.equal(suggestBatch(batches.slice(0, 2)), 'b2');
  const b = buildEnrolBoard({ today: '2026-11-26', enrolments: [e('1'), e('2', { totalValue: 1500, currency: 'USD' }), e('3', { status: 'cancelled' }), e('4', { batchId: 'b1' })], batches });
  assert.equal(b.rows.length, 3);
  assert.equal(b.waiting, 2);
  assert.deepEqual(b.rows[0].options.map((o) => o.id), ['b1', 'b2']);
  assert.equal(b.rows[0].suggested, 'b2');
  assert.match(text(b.headline), /^2 people have enrolled \(₹17,500 \+ \$1,500\) and aren’t in a batch yet,/);
  assert.equal(b.kpis[2].value, '1 of 3');
  assert.equal(b.kpis[3].value, '21 Dec');
  assert.equal(moneyTotal([{ totalValue: null, currency: null }]), '—');
});

test('enrolments board: everyone placed', () => {
  const b = buildEnrolBoard({ today: '2026-11-26', enrolments: [e('4', { batchId: 'b1' })], batches });
  assert.equal(b.waiting, 0);
  assert.match(text(b.headline), /^Everyone who enrolled is in a batch\./);
});
