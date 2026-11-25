import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { mentionedCourse, recordVsConversation, sharedNumbers, signals } from '../../lib/person-checks.ts';

const courses = [['a', '200-Hour Yoga Teacher Training'], ['b', 'Online 200-Hour Yoga Teacher Training'], ['c', '85-Hour Prenatal & Postnatal Yoga TTC'], ['d', 'Online Face Yoga TTC']].map(([id, name]) => ({ id, name }));
const m = (direction, body, at) => ({ direction, body, at });

test('the course their messages point to', () => {
  assert.equal(mentionedCourse([m('inbound', 'I want the 200 hour TTC', 'x')], courses)?.course.id, 'a');
  assert.equal(mentionedCourse([m('inbound', '200hr online course?', 'x')], courses)?.course.id, 'b');
  assert.equal(mentionedCourse([m('inbound', 'face yoga online?', 'x')], courses)?.course.id, 'd');
  assert.equal(mentionedCourse([m('inbound', 'details please', 'x')], courses), null);
  assert.equal(mentionedCourse([m('outbound', '200 hour TTC fees', 'x')], courses), null);
});

test('numbers typed in the chat', () => {
  assert.deepEqual(sharedNumbers([m('inbound', 'my no is +91 70228 59769', 't1'), m('inbound', 'fee 25000', 't2')]), [{ digits: '7022859769', at: 't1' }]);
});

test('signals: fee asks, counts, longest wait (open)', () => {
  const s = signals([m('inbound', 'What is the fee?', '2026-11-01T10:00:00Z'), m('outbound', 'Here', '2026-11-03T10:00:00Z'), m('inbound', 'ok how much for 2 months', '2026-11-10T10:00:00Z')], new Date('2026-11-25T10:00:00Z'));
  assert.equal(s.askedFee, 2);
  assert.equal(s.fromThem, 2);
  assert.equal(s.fromUs, 1);
  assert.equal(s.daysSinceLast, 15);
  assert.equal(s.lastWasThem, true);
  assert.equal(s.longestWaitDays, 15);
  assert.equal(s.longestWaitOpen, true);
});

test('record vs conversation flags a course mismatch, an off price and an unsaved number', () => {
  const r = recordVsConversation({
    messages: [m('inbound', 'Interested in the 200 hour course, call me 9876543210', '2026-11-20T10:00:00Z')],
    courses, crmCourse: courses[2], otherInterests: [], value: 60000, currency: 'INR',
    priceRange: { min: 25000, max: 35000, currency: 'INR' }, savedNumbers: [], stageLabel: 'Engaged', now: new Date('2026-11-25T10:00:00Z'),
  });
  assert.equal(r.suggestCourse?.id, 'a');
  assert.ok(r.flags.find((f) => f.label === 'Course in CRM').warn);
  assert.ok(r.flags.find((f) => f.label === 'Value in CRM').warn);
  assert.ok(r.flags.find((f) => f.label === 'Phone / WhatsApp').warn);
  const same = recordVsConversation({
    messages: [m('inbound', '200 hour please', 'x')], courses, crmCourse: courses[2], otherInterests: ['200-Hour Yoga Teacher Training'],
    value: null, currency: null, priceRange: null, savedNumbers: [], stageLabel: 'Engaged',
  });
  assert.equal(same.suggestCourse, null, 'already one of their courses');
});

test('wired into the Customer 360 person page; course change goes through update_crm_lead_fields only', () => {
  const read = (f) => fs.readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');
  const page = read('app/customer-360/[personId]/page.tsx');
  assert.match(page, /<RecordVsConversation check=/);
  assert.match(page, /<SignalsCard s=/);
  const action = read('app/customer-360/actions.ts');
  assert.match(action, /p_patch: \{ interested_course_id: courseId \}/);
});
