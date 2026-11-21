import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCountry } from '../../lib/home-command-center.ts';
import { bestLocation, countryFromPhone, parseLocationAnswer, teamQuotedRupeesOnly } from '../../lib/lead-location.ts';
import { marketFor } from '../../lib/lead-interests.ts';
import { locationHealth } from '../../lib/home-data-health.ts';

test('location: phone country codes', () => {
  assert.equal(countryFromPhone('+91 98765 43210'), 'India');
  assert.equal(countryFromPhone('9876543210'), 'India');
  assert.equal(countryFromPhone('+971501234567'), 'United Arab Emirates');
  assert.equal(countryFromPhone('+12025550123'), 'United States');
  assert.equal(countryFromPhone('+44 7700 900123'), 'United Kingdom');
  assert.equal(countryFromPhone('0044 7700 900123'), 'United Kingdom');
  assert.equal(countryFromPhone('12345'), null);
});

test('location: rupee-only quotes from the team mean India', () => {
  assert.equal(teamQuotedRupeesOnly(['The fee is ₹30,000', 'Early bird ₹20,000']), true);
  assert.equal(teamQuotedRupeesOnly(['The fee is ₹60,000 or $950 for international']), false);
  assert.equal(teamQuotedRupeesOnly(['Hello!']), false);
});

test('location: strongest clue wins; messy country text is normalised', () => {
  const l = bestLocation([
    { source: 'team_quote', country: 'India' },
    { source: 'phone', country: 'United Arab Emirates' },
    { source: 'language', country: 'India' },
  ], normalizeCountry);
  assert.equal(l.country, 'United Arab Emirates');
  assert.equal(l.source, 'phone');
  assert.equal(bestLocation([{ source: 'stated', country: 'Tamilnadu' }], normalizeCountry).country, 'India');
  assert.equal(bestLocation([{ source: 'stated', country: 'UNK' }], normalizeCountry), null);
  const city = bestLocation([{ source: 'phone', country: 'India' }, { source: 'conversation', country: 'India', city: 'Pune', evidence: "I'm from Pune" }], normalizeCountry);
  assert.deepEqual([city.country, city.city, city.source], ['India', 'Pune', 'phone']);
});

test('location: AI answers', () => {
  assert.equal(parseLocationAnswer('{"country":"India","city":"Pune","basis":"said","evidence":"from Pune"}').source, 'conversation');
  assert.equal(parseLocationAnswer('{"country":"India","city":"","basis":"language","evidence":"kitna fees"}').source, 'language');
  assert.equal(parseLocationAnswer('{"country":"","city":"","basis":"none","evidence":""}'), null);
});

test('market: typed places and inferred country count', () => {
  assert.equal(marketFor({ country: normalizeCountry('Pune') }), 'india');
  assert.equal(marketFor({ country: normalizeCountry('Indis') }), 'india');
  assert.equal(marketFor({ country: 'Germany' }), 'international');
  assert.equal(marketFor({ inferredCountry: 'India' }), 'india');
  assert.equal(marketFor({ phone: '+447700900123', inferredCountry: 'India' }), 'international');
  assert.equal(marketFor({}), 'unknown');
});

test('location health explains inferred share', () => {
  assert.equal(locationHealth({ filled: 600, total: 1400, inferred: 480 }).note, '43% known · 34% from clues');
});

import { phoneInText } from '../../lib/lead-location.ts';

test('a WhatsApp number typed in a message gives the country; prices and dates do not', () => {
  assert.equal(countryFromPhone(phoneInText('Sure, my WhatsApp is +91 98765 43210')), 'India');
  assert.equal(countryFromPhone(phoneInText('whatsapp 9876543210 please')), 'India');
  assert.equal(countryFromPhone(phoneInText('Call me on +44 7911 123456')), 'United Kingdom');
  assert.equal(phoneInText('The fee is ₹60,000 for 2026-12-07'), null);
  assert.equal(phoneInText('I will join in December 2026'), null);
  assert.equal(phoneInText(null), null);
});
