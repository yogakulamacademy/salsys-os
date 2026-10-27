import 'server-only';

import { timingSafeEqual } from 'node:crypto';

export function secretMatches(
  supplied: string | null | undefined,
  expected: string | null | undefined,
) {
  const left = supplied?.trim() ?? '';
  const right = expected?.trim() ?? '';

  if (!left || !right) {
    return false;
  }

  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function bearerMatchesAnySecret(
  authorization: string | null | undefined,
  secrets: readonly string[],
) {
  const match = authorization?.trim().match(/^Bearer\s+(.+)$/i);
  const suppliedSecret = match?.[1]?.trim() ?? '';

  if (!suppliedSecret) {
    return false;
  }

  return secrets.some((secret) => secretMatches(suppliedSecret, secret));
}
