import { NextRequest, NextResponse } from 'next/server';

import { runSearchIndexWorker } from '@/lib/search/opensearch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function isAuthorized(request: NextRequest) {
  const authorization = request.headers.get('authorization');
  const secrets = [
    process.env.SEARCH_INDEX_WORKER_SECRET,
    process.env.CRON_SECRET,
  ]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  if (secrets.length === 0) {
    throw new Error('SEARCH_INDEX_WORKER_SECRET or CRON_SECRET is not configured.');
  }

  return secrets.some((secret) => authorization === `Bearer ${secret}`);
}

function safeError(error: unknown) {
  if (!(error instanceof Error)) return 'Search indexing failed.';
  const message = error.message || 'Search indexing failed.';
  return message
    .replace(/Bearer\s+[^\s]+/gi, 'Bearer [redacted]')
    .replace(/Basic\s+[^\s]+/gi, 'Basic [redacted]')
    .replace(/https?:\/\/[^\s/@]+:[^\s/@]+@/gi, 'https://[redacted]@')
    .slice(0, 1000);
}

async function execute(request: NextRequest, body?: { organizationId?: string }) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const organizationId = body?.organizationId?.trim() || undefined;
  const result = await runSearchIndexWorker({ organizationId });

  return NextResponse.json(result, {
    status: result.ok ? 200 : 207,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function GET(request: NextRequest) {
  try {
    return await execute(request);
  } catch (error) {
    console.error('Search index worker failed.');
    return NextResponse.json(
      { ok: false, error: safeError(error) },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    let body: { organizationId?: string } = {};
    try {
      const raw = await request.json();
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        const input = raw as Record<string, unknown>;
        if (typeof input.organizationId === 'string') {
          body.organizationId = input.organizationId;
        }
      }
    } catch {
      body = {};
    }

    return await execute(request, body);
  } catch (error) {
    console.error('Search index worker failed.');
    return NextResponse.json(
      { ok: false, error: safeError(error) },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
