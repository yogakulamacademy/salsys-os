/** Offline-only opaque link-token primitives; no endpoint, DB, or send integration. */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

/** Fresh per-recipient token; persist only an HMAC digest server-side. */
export function createDmLinkToken(): string {
  return randomBytes(32).toString('base64url');
}

export function digestDmLinkToken(token: string, secret: string): string {
  if (!TOKEN_RE.test(token) || !secret || Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('Invalid DM link token or server signing configuration.');
  }
  return createHmac('sha256', secret).update(token, 'utf8').digest('hex');
}

/** Check digest equality without timing-variable string comparison. */
export function matchesDmLinkTokenDigest(token: string, secret: string, digest: string): boolean {
  if (!/^[a-f0-9]{64}$/.test(digest)) return false;
  try {
    const expected = Buffer.from(digestDmLinkToken(token, secret), 'hex');
    const actual = Buffer.from(digest, 'hex');
    return timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}
