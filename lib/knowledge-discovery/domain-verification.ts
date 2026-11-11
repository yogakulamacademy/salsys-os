import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Website owner publishes this exact single line at
 * https://<configured-host>/.well-known/salsysos-verification.txt
 * No crawl, HTML extraction or AI publication occurs in this challenge.
 */
export const DOMAIN_PROOF_PATH = '/.well-known/salsysos-verification.txt';
const TOKEN_RE = /^salsysos-domain-verification=[0-9a-f]{64}$/;

export function discoveryVerificationHost(hostname: string): string {
  return hostname.toLowerCase().replace(/\.$/, '');
}

export function newDomainChallenge(): { token: string; tokenHash: string } {
  const token = 'salsysos-domain-verification=' + randomBytes(32).toString('hex');
  return { token, tokenHash: digestDomainChallenge(token) };
}

export function digestDomainChallenge(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** A valid proof is an EXACT, single-line token that matches the issued hash. */
export function domainProofMatches(content: string, expectedHash: string): boolean {
  const token = content.trim();
  if (token.length !== 93 || !TOKEN_RE.test(token) || !/^[0-9a-f]{64}$/.test(expectedHash)) {
    return false;
  }
  const incoming = Buffer.from(digestDomainChallenge(token), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return timingSafeEqual(incoming, expected);
}

export function discoveryDomainVerified(
  row: { verified_at?: string | null; verified_until?: string | null } | null | undefined,
  at = Date.now(),
): boolean {
  if (!row?.verified_at || !row.verified_until) return false;
  const since = Date.parse(row.verified_at);
  const until = Date.parse(row.verified_until);
  return Number.isFinite(since) && Number.isFinite(until) && since <= at && until > at;
}
