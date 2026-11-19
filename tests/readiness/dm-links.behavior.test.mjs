import test from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyLinkRequest, courseDestination, isAllowedDestination, isLinkCode, newLinkCode,
  noOpenTaskDue, trackedLinkUrl, countryName, isAppHost, fallbackDestination,
} from '../../lib/dm-links.ts';

const IG_INAPP = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 345.0.0.31.98 (iPhone14,2; iOS 17_5; en_IN; en)';
const CHROME = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';

test('link codes are random, unguessable and on our short domain', () => {
  const a = newLinkCode(); const b = newLinkCode();
  assert.equal(a.length, 10); assert.notEqual(a, b); assert.ok(isLinkCode(a));
  // Standard plan: salsysos.com/go/. Premium: the business's verified branded domain.
  assert.equal(trackedLinkUrl('Ab3dEf7hJk'), 'https://salsysos.com/go/Ab3dEf7hJk');
  assert.equal(trackedLinkUrl('Ab3dEf7hJk', { linkDomain: 'go.brand.com', linkDomainVerified: false }), 'https://salsysos.com/go/Ab3dEf7hJk');
  assert.equal(trackedLinkUrl('Ab3dEf7hJk', { linkDomain: 'go.brand.com', linkDomainVerified: true }), 'https://go.brand.com/Ab3dEf7hJk');
  assert.equal(isLinkCode('../etc'), false); assert.equal(isLinkCode('short'), false);
});

test('only real browser opens count; link previews and bots never do', () => {
  assert.deepEqual(classifyLinkRequest({ method: 'GET', userAgent: IG_INAPP }), { kind: 'open', agent: 'instagram_inapp' });
  assert.equal(classifyLinkRequest({ method: 'GET', userAgent: CHROME }).kind, 'open');
  assert.equal(classifyLinkRequest({ method: 'GET', userAgent: 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)' }).kind, 'preview_or_bot');
  assert.equal(classifyLinkRequest({ method: 'GET', userAgent: 'meta-externalagent/1.1' }).kind, 'preview_or_bot');
  assert.equal(classifyLinkRequest({ method: 'HEAD', userAgent: CHROME }).kind, 'preview_or_bot');
  assert.equal(classifyLinkRequest({ method: 'GET', userAgent: CHROME, purpose: 'prefetch' }).kind, 'preview_or_bot');
  assert.equal(classifyLinkRequest({ method: 'GET', userAgent: 'curl/8.4.0' }).kind, 'preview_or_bot');
  assert.equal(classifyLinkRequest({ method: 'GET', userAgent: '' }).kind, 'preview_or_bot');
  assert.equal(classifyLinkRequest({ method: 'GET', userAgent: 'WhatsApp/2.23.20.0' }).kind, 'preview_or_bot');
});

test("links only go to the business's own website; Kerala page when the lead prefers Kerala", () => {
  const hosts = ['yogakulamacademy.com', 'www.yogakulamacademy.com'];
  const md = { website_url: 'https://www.yogakulamacademy.com/200hr-yoga-ttc-mysore.php', website_url_kerala: 'https://www.yogakulamacademy.com/200hr-yoga-ttc-kerala.php' };
  assert.equal(courseDestination(md, null, hosts), md.website_url);
  assert.equal(courseDestination(md, 'Kerala', hosts), md.website_url_kerala);
  assert.equal(courseDestination(md, null, ['otherbusiness.com']), null); // another business's site is never allowed
  assert.equal(courseDestination({ website_url: 'https://evil.example/x' }, null, hosts), null);
  assert.equal(courseDestination({}, null, hosts), null);
  assert.equal(isAllowedDestination('https://yogakulamacademy.com/online-200hr-yoga-ttc.php', hosts), true);
  assert.equal(isAllowedDestination('https://yogakulamacademy.com.evil.io/', hosts), false);
  assert.equal(isAllowedDestination('http://yogakulamacademy.com/', hosts), false);
  assert.equal(isAllowedDestination('https://user@yogakulamacademy.com/', hosts), false);
  assert.equal(fallbackDestination(hosts), 'https://yogakulamacademy.com/');
  assert.equal(fallbackDestination([]), 'https://salsysos.com/');
});

test('the CRM knows its own hosts; any other host is a business link domain', () => {
  for (const h of ['salsysos.com', 'crm.salsysos.com', 'salsys-os.vercel.app', 'localhost']) assert.equal(isAppHost(h), true);
  for (const h of ['go.yogakulamacademy.com', 'links.brand.in', 'salsysos.com.evil.io']) assert.equal(isAppHost(h), false);
});

test('an unopened link becomes a team task after 12 hours, only if the lead has not replied', () => {
  const now = new Date('2026-11-20T12:00:00Z');
  const base = { sentAt: '2026-11-19T23:00:00Z', firstOpenedAt: null, attentionTaskId: null, revokedAt: null, lastInboundAt: '2026-11-19T22:50:00Z', leadClosed: false, now };
  assert.equal(noOpenTaskDue(base), true);                                              // 13h, no reply since
  assert.equal(noOpenTaskDue({ ...base, sentAt: '2026-11-20T01:00:00Z' }), false);      // only 11h
  assert.equal(noOpenTaskDue({ ...base, firstOpenedAt: '2026-11-20T00:00:00Z' }), false); // opened
  assert.equal(noOpenTaskDue({ ...base, lastInboundAt: '2026-11-20T02:00:00Z' }), false); // replied after
  assert.equal(noOpenTaskDue({ ...base, attentionTaskId: 't1' }), false);                 // task exists
  assert.equal(noOpenTaskDue({ ...base, leadClosed: true }), false);
  assert.equal(noOpenTaskDue({ ...base, sentAt: null }), false);                          // never sent
});

test('visit country shows a readable name', () => {
  assert.equal(countryName('AE'), 'UAE'); assert.equal(countryName('in'), 'India'); assert.equal(countryName('PT'), 'PT'); assert.equal(countryName(null), null);
});
