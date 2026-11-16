import test from 'node:test';
import assert from 'node:assert/strict';

import {
  extractPagePrices,
  locationMatches,
  matchCoursePage,
  parseLongDate,
  snapshotAgeDays,
  suggestInr,
} from '../../lib/website-price-extract.ts';

// Shortened excerpts of public yogakulam.com course pages (SEO crawler snapshots, 14 Oct 2026).
const MYSORE_200 = 'Course Highlights: Private Room $1500 $2050 Shared Room $1250 $1750 Course Name 200 Hour Yoga Teacher Training Certificate Start Date 7th November 2026 End Date 30th November 2026 Room Type Private Room : $1500 Twin Share : $1250 Availability 10 Slots Booking Enroll Now Start Date 7th December 2026 End Date 30th December 2026 Room Type Private Room : $1500 Twin Share : $1250 Availability 10 Slots Booking Enroll Now Start Date 7th February 2027 End Date 2nd March 2027 Room Type Private Room : $1500 Twin Share : $1250 Availability 10 Slots Booking Enroll Now Important Course fees include accommodation';
const MYSORE_300 = 'Course Highlights: Private Room $1750 $2550 Shared Room $1550 $1250 Start Date 7th November 2026 End Date 4th December 2026 Room Type Private Room : $1750 Twin Share : $1550 Availability 10 Slots';
const KUNDALINI = 'Course Highlights: Private Room $1000 $1550 Shared Room $750 $1250 Start Date 20th November 2026 End Date 28th November 2026 Room Type Private Room : $1000 Twin Share : $750 Availability Enquire for availability Booking Enroll Now Sorry, your offer has expired';
const RETREAT = 'Course Highlights: Price Starting From: Private Room $750 Shared Room $500 7days /14 days /21 Days Yoga Retreat Program';

test('dates parse from the website format', () => {
  assert.equal(parseLongDate('7th December 2026'), '2026-12-07');
  assert.equal(parseLongDate('2nd March 2027'), '2027-03-02');
  assert.equal(parseLongDate('31st Foo 2026'), null);
});

test('offer and regular prices come from the summary; each batch keeps its own price', () => {
  const p = extractPagePrices(MYSORE_200);
  assert.deepEqual(p.summary, { privateOffer: 1500, privateRegular: 2050, sharedOffer: 1250, sharedRegular: 1750 });
  assert.equal(p.batches.length, 3);
  assert.deepEqual(p.batches[1], { startDate: '2026-12-07', endDate: '2026-12-30', privatePrice: 1500, sharedPrice: 1250 });
  assert.equal(p.batches[2].endDate, '2027-03-02');
  assert.deepEqual(p.flags, []);
});

test('suspicious pages are flagged, not trusted', () => {
  assert.ok(extractPagePrices(MYSORE_300).flags.some((f) => /Regular shared price is lower/.test(f)));
  const k = extractPagePrices(KUNDALINI);
  assert.equal(k.offerExpired, true);
  assert.ok(k.flags.some((f) => /expired/.test(f)));
  assert.equal(k.batches[0].sharedPrice, 750);
  const r = extractPagePrices(RETREAT);
  assert.equal(r.batches.length, 0);
  assert.equal(r.summary.privateOffer, 750);
  assert.ok(extractPagePrices('Contact us').flags.includes('No prices found on the page'));
});

test('course pages map to course code and location; non-course pages do not', () => {
  assert.deepEqual(matchCoursePage('https://www.yogakulam.com/courses/mysore/200-hour-yoga-teacher-training-in-mysore.php'), { courseCode: '200H-YTT', location: 'Mysore' });
  assert.deepEqual(matchCoursePage('https://www.yogakulam.com/courses/kerala/prenatal-yoga-teacher-training-in-kerala.php'), { courseCode: '85H-PRENATAL', location: 'Kerala' });
  assert.deepEqual(matchCoursePage('https://www.yogakulam.com/courses/online/online-prenatal-yoga-teacher-training.php'), { courseCode: 'ONLINE-PRENATAL', location: 'Online' });
  assert.deepEqual(matchCoursePage('https://www.yogakulam.com/courses/mysore/sound-healing-meditation-course-level-2-in-mysore.php'), { courseCode: 'SOUND-L2', location: 'Mysore' });
  assert.equal(matchCoursePage('https://www.yogakulam.com/about-us.php'), null);
  assert.equal(locationMatches('Varkala, Kerala', 'Kerala'), true);
  assert.equal(locationMatches('Bengaluru - RT Nagar', 'Bengaluru'), true);
  assert.equal(locationMatches('Mysore', 'Kerala'), false);
});

test('INR suggestion rounds to ₹500 and needs a real rate', () => {
  assert.equal(suggestInr(950, 84.4), 80000);
  assert.equal(suggestInr(499, 84.4), 42000);
  assert.equal(suggestInr(null, 84), null);
  assert.equal(suggestInr(500, 0), null);
});

test('snapshot age is measured in days', () => {
  assert.equal(snapshotAgeDays('2026-10-14T15:55:25Z', new Date('2026-11-16T12:00:00Z')), 32);
});
