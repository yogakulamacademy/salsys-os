import test from 'node:test';
import assert from 'node:assert/strict';
import { feeMarketFor, feeRule } from '../../lib/fee-market.ts';

test('the most reliable known country decides the fee', () => {
  assert.deepEqual(feeMarketFor({ stated: 'India' }), { market: 'india', country: 'India', source: 'their details' });
  assert.equal(feeMarketFor({ stated: null, linkCountry: 'US', inferred: 'IN' }).market, 'international');
  assert.equal(feeMarketFor({ inferred: 'IN' }).market, 'india');
  assert.equal(feeMarketFor({ geoCountry: 'DE' }).source, 'their website visit');
});

test('unknown means no fee amount and a friendly where question, never India-or-abroad', () => {
  assert.equal(feeMarketFor({}).market, 'unknown');
  const rule = feeRule('unknown');
  assert.match(rule, /Do not quote any fee amount/);
  assert.match(rule, /share your WhatsApp number\? I'll send you the fee details and brochure there/);
  assert.match(rule, /Where are you joining us from\?/);
  assert.match(rule, /Never ask "India or abroad"/);
  assert.match(feeRule('india'), /only the Indian fee/);
  assert.match(feeRule('international'), /only the international fee/);
});
