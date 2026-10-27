import { NextRequest, NextResponse } from 'next/server';

import { bearerMatchesAnySecret } from '@/lib/security/machine-bearer-auth';
import { getOpenSearchHealth } from '@/lib/search/health';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isAuthorized(request: NextRequest) {
  const authorization = request.headers.get('authorization');
  const secrets = [process.env.SEARCH_INDEX_WORKER_SECRET, process.env.CRON_SECRET]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  if (secrets.length === 0) throw new Error('Search health authorization is not configured.');
  return bearerMatchesAnySecret(authorization, secrets);
}

function safeError(error: unknown) {
  if (!(error instanceof Error)) return 'Unable to check OpenSearch health.';
  return error.message
    .replace(/Bearer\s+[^\s]+/gi, 'Bearer [redacted]')
    .replace(/Basic\s+[^\s]+/gi, 'Basic [redacted]')
    .replace(/https?:\/\/[^\s/@]+:[^\s/@]+@/gi, 'https://[redacted]@')
    .slice(0, 500);
}

export async function GET(request: NextRequest) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const health = await getOpenSearchHealth();
    return NextResponse.json(health, {
      status: health.ok ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: safeError(error) },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
