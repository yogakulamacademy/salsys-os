import 'server-only';

import { timingSafeEqual } from 'node:crypto';

function constantTimeEqual(left: string, right: string) {
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

  return secrets.some((secret) => constantTimeEqual(suppliedSecret, secret));
}
