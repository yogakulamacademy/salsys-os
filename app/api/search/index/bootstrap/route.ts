import { NextRequest, NextResponse } from 'next/server';

import { bootstrapOpenSearchIndex } from '@/lib/search/health';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

function isAuthorized(request: NextRequest) {
  const authorization = request.headers.get('authorization');
  const secrets = [process.env.SEARCH_INDEX_WORKER_SECRET, process.env.CRON_SECRET]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  if (secrets.length === 0) throw new Error('Search bootstrap authorization is not configured.');
  return secrets.some((secret) => authorization === `Bearer ${secret}`);
}

function safeError(error: unknown) {
  if (!(error instanceof Error)) return 'Unable to bootstrap OpenSearch.';
  return error.message
    .replace(/Bearer\s+[^\s]+/gi, 'Bearer [redacted]')
    .replace(/Basic\s+[^\s]+/gi, 'Basic [redacted]')
    .replace(/https?:\/\/[^\s/@]+:[^\s/@]+@/gi, 'https://[redacted]@')
    .slice(0, 500);
}

export async function POST(request: NextRequest) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const result = await bootstrapOpenSearchIndex();
    return NextResponse.json(result, {
      status: result.ok ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: safeError(error) },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
