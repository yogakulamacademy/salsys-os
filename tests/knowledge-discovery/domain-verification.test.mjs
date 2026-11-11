import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DOMAIN_PROOF_PATH, newDomainChallenge, digestDomainChallenge,
  domainProofMatches, discoveryVerificationHost, discoveryDomainVerified,
} from '../../lib/knowledge-discovery/domain-verification.ts';

test('website ownership challenge uses a fresh 256-bit token and stores only a hash', () => {
  const first = newDomainChallenge();
  const second = newDomainChallenge();
  assert.equal(DOMAIN_PROOF_PATH, '/.well-known/salsysos-verification.txt');
  assert.match(first.token, /^salsysos-domain-verification=[0-9a-f]{64}$/);
  assert.notEqual(first.token, second.token);
  assert.notEqual(first.tokenHash, first.token);
  assert.equal(first.tokenHash, digestDomainChallenge(first.token));
  assert.equal(first.tokenHash.length, 64);
  assert.equal(domainProofMatches(first.token + '\n', first.tokenHash), true);
  assert.equal(domainProofMatches(second.token, first.tokenHash), false);
  assert.equal(domainProofMatches(first.token + '\nextra', first.tokenHash), false);
  assert.equal(domainProofMatches(first.token + '<html>', first.tokenHash), false);
  assert.equal(domainProofMatches(first.token, 'invalid-hash'), false);
});

test('verification is scoped to exact configured base hostname and expires', () => {
  assert.equal(discoveryVerificationHost('WWW.Example.COM.'), 'www.example.com');
  assert.equal(discoveryVerificationHost('other.example.com'), 'other.example.com');
  const now = Date.UTC(2026, 10, 6);
  const row = { verified_at: new Date(now - 1000).toISOString(),
    verified_until: new Date(now + 1000).toISOString() };
  assert.equal(discoveryDomainVerified(row, now), true);
  assert.equal(discoveryDomainVerified(row, now + 1000), false);
  assert.equal(discoveryDomainVerified({ verified_at: null, verified_until: row.verified_until }, now), false);
  assert.equal(discoveryDomainVerified({ verified_at: 'garbage', verified_until: row.verified_until }, now), false);
  assert.equal(discoveryDomainVerified(null, now), false);
});
