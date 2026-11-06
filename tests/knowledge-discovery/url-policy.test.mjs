import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseWebsiteSeed, publicIpOnly, pinPublicAddress, scopedDiscoveredUrl,
} from '../../lib/knowledge-discovery/url-policy.ts';

test('normalizes a public homepage without tracking query parameters', () => {
  assert.equal(parseWebsiteSeed('yogakulam.com/?utm_source=x#top').href, 'https://yogakulam.com/');
});

test('rejects credentials, nonstandard ports, unsafe schemes and internal hosts', () => {
  for (const site of [
    'http://127.0.0.1', 'http://localhost', 'http://metadata.google.internal',
    'https://example.local', 'https://foo.test', 'file:///etc/passwd',
    'https://user:secret@yogakulam.com', 'https://yogakulam.com:8443',
    'http://[::1]/', 'https://192.168.0.5', 'http://0x7f000001',
  ]) {
    assert.throws(() => parseWebsiteSeed(site), undefined, site);
  }
});

test('refuses private, reserved, metadata and transition IP ranges', () => {
  for (const ip of [
    '0.0.0.0', '10.1.2.3', '127.0.0.1', '169.254.169.254',
    '100.64.2.3', '172.16.0.1', '192.168.1.1', '192.0.2.1',
    '198.51.100.25', '203.0.113.1', '224.0.0.1',
    '::1', 'fc00::1', 'fe80::1', '2001:db8::1',
    '::ffff:127.0.0.1', '2002::1', '2001::1',
    '2001:0000:0000::1', '2001:db8::1', '2001:0db8::1', '3fff::1',
  ]) {
    assert.equal(publicIpOnly(ip), false, ip);
  }
  for (const ip of ['1.1.1.1', '8.8.8.8', '9.9.9.9', '2606:4700::1111', '2001:4860:4860::8888']) {
    assert.equal(publicIpOnly(ip), true, ip);
  }
});

test('rejects mixed DNS responses even if the first address is public', async () => {
  const seed = parseWebsiteSeed('https://yogakulam.com');
  await assert.rejects(pinPublicAddress(seed, async () => [
    { address: '8.8.8.8', family: 4 },
    { address: '127.0.0.1', family: 4 },
  ]), /exclusively/);
  assert.deepEqual(await pinPublicAddress(seed, async () => [
    { address: '8.8.8.8', family: 4 },
  ]), { address: '8.8.8.8', family: 4 });
});

test('discovery is scoped to the exact verified hostname', () => {
  const seed = parseWebsiteSeed('https://yogakulam.com/');
  const page = new URL('https://yogakulam.com/courses/');
  assert.equal(scopedDiscoveredUrl(seed, page, '/about?ref=link')?.href,
    'https://yogakulam.com/about');
  for (const href of [
    'https://evil-yogakulam.com/path', 'https://foo.yogakulam.com/x',
    'https://www.yogakulam.com/x',
    'http://yogakulam.com/x', 'mailto:hello@yogakulam.com',
    'javascript:alert(1)', 'https://127.0.0.1',
    'https://yogakulam.com:444/x', '#section',
  ]) {
    assert.equal(scopedDiscoveredUrl(seed, page, href), null, href);
  }
});


test('an HTTPS seed never permits an HTTP page even when the candidate is already HTTP', () => {
  const seed = parseWebsiteSeed('https://yogakulam.com');
  const hostilePage = new URL('http://yogakulam.com/private');
  assert.equal(scopedDiscoveredUrl(seed, hostilePage, hostilePage.href), null);
});


test('unresponsive DNS cannot hold a worker indefinitely', async () => {
  const seed = parseWebsiteSeed('https://yogakulam.com/');
  await assert.rejects(pinPublicAddress(seed, () => new Promise(() => {}), 10),
    /DNS resolution timed out/);
});
