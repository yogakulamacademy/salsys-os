import test from 'node:test';
import assert from 'node:assert/strict';

import { requestGeoFromHeaders } from '../../lib/request-geo.ts';

const h = (obj) => new Headers(obj);

test('Vercel headers are read first', () => {
  assert.deepEqual(
    requestGeoFromHeaders(h({ 'x-vercel-ip-country': 'in', 'x-vercel-ip-country-region': 'KA', 'x-vercel-ip-city': 'Bengaluru', 'x-vercel-ip-timezone': 'Asia/Kolkata', 'cf-ipcountry': 'US' })),
    { country: 'IN', region: 'KA', city: 'Bengaluru', timezone: 'Asia/Kolkata' },
  );
});

test('behind Cloudflare the cf- headers fill in', () => {
  assert.deepEqual(
    requestGeoFromHeaders(h({ 'cf-ipcountry': 'IN', 'cf-region-code': 'KL', 'cf-ipcity': 'Kochi', 'cf-timezone': 'Asia/Kolkata' })),
    { country: 'IN', region: 'KL', city: 'Kochi', timezone: 'Asia/Kolkata' },
  );
});

test('unknown and Tor are not countries; encoded cities decode', () => {
  assert.equal(requestGeoFromHeaders(h({ 'cf-ipcountry': 'XX' })).country, null);
  assert.equal(requestGeoFromHeaders(h({ 'cf-ipcountry': 'T1' })).country, null);
  assert.equal(requestGeoFromHeaders(h({ 'x-vercel-ip-city': 'S%C3%A3o%20Paulo' })).city, 'São Paulo');
  assert.deepEqual(requestGeoFromHeaders(h({})), { country: null, region: null, city: null, timezone: null });
});
