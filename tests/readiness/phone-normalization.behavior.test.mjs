import test from 'node:test';
import assert from 'node:assert/strict';

import { countryToIso, normalizeLeadPhone } from '../../lib/phone-normalization.ts';

const n = (raw, hints) => normalizeLeadPhone(raw, hints);

test('numbers typed with + or 00 keep their own country code', () => {
  const plus = n('+91 98765 43210', { formCountry: 'Belgium' });
  assert.equal(plus.e164, '+919876543210');
  assert.equal(plus.status, 'already_international');
  assert.equal(plus.country, 'IN');
  assert.equal(plus.autoSendSafe, true);
  const zeros = n('0044 7911 123456', { formCountry: 'India' });
  assert.equal(zeros.e164, '+447911123456');
  assert.equal(zeros.country, 'GB');
});

test('Indian 10-digit numbers get +91 from the form country, with or without a trunk 0', () => {
  for (const raw of ['9876543210', '98765-43210', '09876543210']) {
    const result = n(raw, { formCountry: 'India', timezone: 'Asia/Kolkata' });
    assert.equal(result.e164, '+919876543210', raw);
    assert.equal(result.status, 'country_added', raw);
    assert.equal(result.countrySource, 'form_country', raw);
    assert.equal(result.autoSendSafe, true, raw);
  }
});

test('a code typed without "+" is recognised, but a valid local number is not mistaken for one', () => {
  const coded = n('919876543210', { formCountry: 'IN' });
  assert.equal(coded.e164, '+919876543210');
  assert.equal(coded.status, 'code_present');
  // 10 digits starting 91 is itself a valid Indian mobile: add +91, do not strip.
  const local = n('9198765432', { formCountry: 'India' });
  assert.equal(local.e164, '+919198765432');
  assert.equal(local.status, 'country_added');
  const belgian = n('32470123456', { formCountry: 'Belgium' });
  assert.equal(belgian.e164, '+32470123456');
  assert.equal(belgian.status, 'code_present');
});

test('visitor location different from the phone country is flagged, never silently prefixed', () => {
  // A Belgian mobile typed without a code by someone browsing from India.
  const result = n('470123456', { ipCountry: 'IN', timezone: 'Asia/Kolkata' });
  assert.equal(result.e164, null);
  assert.equal(result.status, 'needs_review');
  assert.equal(result.autoSendSafe, false);
  // The form country is trusted over IP and timezone.
  const fromForm = n('470123456', { formCountry: 'Belgium', ipCountry: 'IN', timezone: 'Asia/Kolkata' });
  assert.equal(fromForm.e164, '+32470123456');
  assert.equal(fromForm.countrySource, 'form_country');
});

test('timezone alone is weak evidence unless the national pattern is strict', () => {
  const india = n('9876543210', { timezone: 'Asia/Calcutta' });
  assert.equal(india.e164, '+919876543210');
  assert.equal(india.confidence, 'medium');
  assert.equal(india.autoSendSafe, true);
  const us = n('2025550123', { timezone: 'America/New_York' });
  assert.equal(us.e164, '+12025550123');
  assert.equal(us.confidence, 'low');
  assert.equal(us.autoSendSafe, false);
});

test('invalid, empty and hint-less numbers never produce an E.164 value', () => {
  assert.equal(n('', { formCountry: 'India' }).status, 'empty');
  assert.equal(n(null).status, 'empty');
  assert.equal(n('12345', { formCountry: 'India' }).status, 'needs_review');
  assert.equal(n('9876543210', {}).status, 'needs_review');
  assert.equal(n('+12', {}).status, 'needs_review');
  assert.equal(n('5876543210', { formCountry: 'India' }).e164, null, 'Indian mobiles start 6-9');
});

test('country names and codes resolve; unknown text does not', () => {
  assert.equal(countryToIso('India'), 'IN');
  assert.equal(countryToIso('uk'), 'GB');
  assert.equal(countryToIso('United States'), 'US');
  assert.equal(countryToIso('be'), 'BE');
  assert.equal(countryToIso('Atlantis'), null);
  assert.equal(n('9876543210', { formCountry: 'Atlantis', ipCountry: 'IN' }).countrySource, 'ip_country');
});
