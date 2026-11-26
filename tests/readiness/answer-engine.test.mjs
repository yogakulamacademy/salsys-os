import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { decide, offerUntil } from '../../lib/answer-engine.ts';
import { buildCourseFacts, mainPlace, parseIncludes, parsePriceBook } from '../../lib/answer-engine-facts.ts';

const fees = fs.readFileSync(new URL('./fixtures/answer-engine-fees.txt', import.meta.url), 'utf8');
const C = (id, name, category, hours, place) => ({ id, name, category, hours, metadata: { website_url: `https://www.example.com/courses/${place}/x.php` } });
const courses = [
  C('y100', '100-Hour Yoga Teacher Training', 'ytt', 100, 'mysore'), C('y200', '200-Hour Yoga Teacher Training', 'ytt', 200, 'mysore'),
  C('y300', '300-Hour Yoga Teacher Training', 'ytt', 300, 'mysore'), C('pre', '85-Hour Prenatal & Postnatal Yoga TTC', 'prenatal', 85, 'mysore'),
  C('kun', '100-Hour Tantra & Kundalini YTT', 'kundalini', 100, 'mysore'), C('sh1', 'Sound Healing Level 1', 'sound_healing', null, 'mysore'),
  C('shm', 'Sound Healing Meditation Master Course', null, null, 'mysore'), C('o200', 'Online 200-Hour Yoga Teacher Training', 'online_ytt', 200, 'online'),
  C('opre', 'Online Prenatal & Postnatal TTC', 'online_prenatal', 85, 'online'), C('face', 'Online Face Yoga TTC', 'face_yoga', null, 'online'),
  C('nut', 'Nutrition Course', null, null, 'online'), C('ayu', 'Ayurveda Retreat', null, null, 'kerala'),
];
const batches = [
  { course_id: 'y200', location: 'Mysore', mode: 'residential', start_date: '2026-12-07' }, { course_id: 'y200', location: 'Kerala', mode: 'residential', start_date: '2026-12-07' },
  { course_id: 'y200', location: 'Bengaluru - RT Nagar', mode: 'non_residential', start_date: '2027-02-01' },
  { course_id: 'pre', location: 'Mysore', mode: 'residential', start_date: '2026-12-01' }, { course_id: 'opre', location: 'Online', mode: 'online', start_date: '2026-12-10' },
  { course_id: 'face', location: 'Online', mode: 'online', start_date: '2026-12-15' }, { course_id: 'o200', location: 'Online', mode: 'online', start_date: '2026-12-15' },
  { course_id: 'sh1', location: 'Mysore', mode: 'residential', start_date: '2026-12-15' },
];
const prices = parsePriceBook(fees, courses);
const facts = buildCourseFacts(courses, batches, parseIncludes(fees, courses));
const now = Date.parse('2026-11-26T10:00:00Z');
const ask = (message, lead = {}) => decide({ message, now, lead: { courseId: null, preferredPlace: null, market: 'india', ...lead }, courses: facts, prices, defaultPlace: mainPlace(courses) });
const find = (id, place, cur) => prices.find((p) => p.courseId === id && p.place === place && p.currency === cur && !p.variant);

test('reads the approved fee list into a price book', () => {
  assert.deepEqual(find('y200', 'Mysore', 'INR'), { courseId: 'y200', place: 'Mysore', variant: undefined, currency: 'INR', twin: 60000 });
  assert.equal(find('pre', 'Mysore', 'INR').private, 40000);
  assert.equal(find('sh1', 'Mysore', 'INR').twin, 35000);
  assert.equal(find('face', 'Online', 'INR').regular, 20000);
  assert.deepEqual([find('o200', 'Online', 'INR').regular, find('o200', 'Online', 'INR').offer], [30000, 20000]);
  assert.equal(find('nut', 'Online', 'INR').offer, 20000);
  assert.deepEqual([find('y200', 'Kerala', 'USD').private, find('y200', 'Kerala', 'USD').twin], [1250, 950]);
  assert.equal(find('kun', 'Mysore', 'USD').twin, 750);
  assert.equal(find('shm', 'Mysore', 'USD').private, 1600);
  assert.equal(find('opre', 'Online', 'USD').offer, 499);
  assert.ok(!prices.some((p) => p.place === 'Bengaluru' && p.currency === 'USD'));
  assert.ok(!find('ayu', 'Kerala', 'USD'));
  assert.equal(mainPlace(courses), 'Mysore');
  assert.equal(facts.find((f) => f.id === 'pre').family, 'prenatal');
  assert.equal(facts.find((f) => f.id === 'y200').family, undefined);
});

test('answers a fee question only from saved facts', () => {
  const a = ask('What is the course fee?', { courseId: 'y200' });
  assert.equal(a.answer, true);
  assert.match(a.text, /200-Hour Yoga TTC in Mysore is ₹60,000 with twin sharing\./);
  assert.match(a.text, /next batch in Mysore starts on 7 Dec/);
  assert.match(a.text, /We also run it in Kerala and Bengaluru\./);
  assert.doesNotMatch(a.text, /\$|http/);
  const usd = ask('fees for 200 hour in kerala?', { market: 'international' });
  assert.match(usd.text, /\$950 with twin sharing or \$1,250 for a private room/);
  const unknown = ask('What is the course fee?', { courseId: 'y200', market: 'unknown' });
  assert.match(unknown.text, /share your WhatsApp number/);
  assert.doesNotMatch(unknown.text, /₹|\$/);
});

test('online early-bird fee comes with a deadline', () => {
  const a = ask('how much is the online 200 hour course', {});
  assert.match(a.text, /₹20,000 \(early-bird fee, valid till 29 Nov; regular fee ₹30,000\)/);
  assert.equal(offerUntil(Date.parse('2026-12-14T00:00:00Z'), '2026-12-15'), null);
});

test('stays quiet when it should', () => {
  assert.equal(ask('Is there any discount?', { courseId: 'y200' }).answer, false);
  assert.equal(ask('I already paid, here is the screenshot', { courseId: 'y200' }).answer, false);
  assert.equal(ask('What is the course fee?').reason, 'course not known');
  assert.equal(ask('What is the course fee?', { courseId: 'pre' }).reason, 'online or in person not clear');
  assert.match(ask('What is the fee for the online course?', { courseId: 'pre' }).text, /Online Prenatal & Postnatal TTC is ₹25,000/);
  assert.equal(ask('My kids no where to go', { courseId: 'sh1' }).answer, false);
  assert.equal(ask('Which option allows me to avail the diwali offer fee', { courseId: 'sh1' }).answer, false);
});

test('online or offline about a course that runs both ways gives both', () => {
  const a = ask('Is it online or offline?', { courseId: 'pre' });
  assert.equal(a.answer, true);
  assert.match(a.text, /both ways: the Online Prenatal & Postnatal TTC with live classes on Zoom \(next batch 10 Dec\), and the in-person 85-Hour Prenatal & Postnatal Yoga TTC in Mysore \(next batch 1 Dec\)/);
  assert.match(ask('When is the next batch?', { courseId: 'face' }).text, /The next Online Face Yoga TTC batch starts on 15 Dec/);
});
