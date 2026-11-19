import test from 'node:test';
import assert from 'node:assert/strict';
import { choosePrimary, estimateValue, isFeeOrDateQuestion, locationFromText, marketFor, mergeInterest, SOURCE_STRENGTH } from '../../lib/lead-interests.ts';

const prices = [
  { courseId: 'c200', location: 'mysore', market: 'india', currency: 'INR', roomType: 'shared', regularPrice: 60000, offerPrice: null, validUntil: null },
  { courseId: 'c200', location: 'mysore', market: 'international', currency: 'USD', roomType: 'private', regularPrice: 1500, offerPrice: null, validUntil: null },
  { courseId: 'c200', location: 'mysore', market: 'international', currency: 'USD', roomType: 'shared', regularPrice: 950, offerPrice: null, validUntil: null },
  { courseId: 'c200', location: 'kerala', market: 'international', currency: 'USD', roomType: 'shared', regularPrice: 950, offerPrice: null, validUntil: null },
  { courseId: 'conl', location: 'online', market: 'india', currency: 'INR', roomType: null, regularPrice: 30000, offerPrice: 20000, validUntil: null },
  { courseId: 'cbng', location: 'bengaluru-weekend', market: 'india', currency: 'INR', roomType: null, regularPrice: 85000, offerPrice: 60000, validUntil: '2026-11-01' },
];

test('value: offer price if still valid, shared room, right market and location', () => {
  assert.deepEqual(estimateValue(prices, 'conl', 'online', 'india', '2026-11-19'), { value: 20000, currency: 'INR', marketUsed: 'india', assumed: false });
  assert.equal(estimateValue(prices, 'c200', 'mysore', 'international', '2026-11-19').value, 950);  // shared, not private
  assert.equal(estimateValue(prices, 'c200', 'mysore', 'unknown', '2026-11-19').currency, 'INR'); // unknown market: India price
  assert.equal(estimateValue(prices, 'c200', 'mysore', 'unknown', '2026-11-19').assumed, true);
  assert.equal(estimateValue(prices, 'cbng', 'bengaluru', 'india', '2026-11-19').value, 85000);  // offer ended: regular price
  assert.equal(estimateValue(prices, 'c200', 'goa', 'india', '2026-11-19').value, 60000);          // no Goa price: any location
  assert.equal(estimateValue(prices, 'nope', null, 'india', '2026-11-19'), null);
  // No rupee fee for this course: value at its USD price, marked as a fallback.
  const k = estimateValue([{ courseId: 'ckun', location: 'mysore', market: 'international', currency: 'USD', roomType: 'shared', regularPrice: 750, offerPrice: null, validUntil: null }], 'ckun', 'mysore', 'india', '2026-11-19');
  assert.deepEqual(k, { value: 750, currency: 'USD', marketUsed: 'international', assumed: false, fallback: true });
});

test('market: what the lead said, then visit country, then phone', () => {
  assert.equal(marketFor({ country: 'India' }), 'india');
  assert.equal(marketFor({ country: 'Germany', phone: '+919876543210' }), 'international');
  assert.equal(marketFor({ visitCountry: 'AE' }), 'international');
  assert.equal(marketFor({ phone: '+91 98765 43210' }), 'india');
  assert.equal(marketFor({ phone: '9876543210' }), 'india');
  assert.equal(marketFor({ phone: '+44 7700 900123' }), 'international');
  assert.equal(marketFor({}), 'unknown');
});

test('the team choice wins, then strength, then most recent; dropped never', () => {
  const rows = [
    { courseId: 'a', strength: 90, lastSeenAt: '2026-11-01T00:00:00Z', status: 'active', setBy: 'system' },
    { courseId: 'b', strength: 85, lastSeenAt: '2026-11-10T00:00:00Z', status: 'active', setBy: 'system' },
    { courseId: 'c', strength: 100, lastSeenAt: '2026-11-11T00:00:00Z', status: 'dropped', setBy: 'staff' },
  ];
  assert.equal(choosePrimary(rows).courseId, 'a');
  assert.equal(choosePrimary([...rows, { courseId: 'd', strength: 40, lastSeenAt: '2026-10-01T00:00:00Z', status: 'active', setBy: 'staff' }]).courseId, 'd');
  assert.equal(choosePrimary([]), null);
});

test('signals: strength merge, fee questions and locations', () => {
  const m = mergeInterest({ strength: 75, sources: ['message'], lastSeenAt: '2026-11-01T00:00:00Z', firstSeenAt: '2026-11-01T00:00:00Z', location: null },
    { source: 'form', at: '2026-11-05T00:00:00Z', location: 'mysore' });
  assert.deepEqual(m, { strength: SOURCE_STRENGTH.form, sources: ['form', 'message'], lastSeenAt: '2026-11-05T00:00:00Z', firstSeenAt: '2026-11-01T00:00:00Z', location: 'mysore' });
  assert.equal(isFeeOrDateQuestion('What is the fee for 200 hour?'), true);
  assert.equal(isFeeOrDateQuestion('kitna hai course?'), true);
  assert.equal(isFeeOrDateQuestion('I love the 200 hour reel'), false);
  assert.equal(locationFromText('200 Hour YTT in Mysore'), 'mysore');
  assert.equal(locationFromText('/courses/kerala/200-hour'), 'kerala');
  assert.equal(locationFromText('weekend batch in Bangalore'), 'bengaluru-weekend');
  assert.equal(locationFromText('/courses/online/online-200'), 'online');
});
