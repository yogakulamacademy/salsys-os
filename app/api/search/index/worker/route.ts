import { NextRequest, NextResponse } from 'next/server';

import { bearerMatchesAnySecret } from '@/lib/security/machine-bearer-auth';
import { runSearchIndexWorker } from '@/lib/search/opensearch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const MAX_POST_BYTES = 4_096;

class PublicRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

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

  return bearerMatchesAnySecret(authorization, secrets);
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

function declaredContentLength(request: NextRequest) {
  const header = request.headers.get('content-length');
  if (!header) return null;

  const value = Number(header);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

async function readOptionalBoundedBody(request: NextRequest) {
  const declared = declaredContentLength(request);
  if (declared !== null && declared > MAX_POST_BYTES) {
    throw new PublicRequestError('Payload too large.', 413);
  }

  if (!request.body) return {} as { organizationId?: string };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      totalBytes += value.byteLength;
      if (totalBytes > MAX_POST_BYTES) {
        await reader.cancel();
        throw new PublicRequestError('Payload too large.', 413);
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  if (totalBytes === 0) return {} as { organizationId?: string };

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const raw = JSON.parse(new TextDecoder().decode(body)) as unknown;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};

    const input = raw as Record<string, unknown>;
    return {
      organizationId:
        typeof input.organizationId === 'string'
          ? input.organizationId
          : undefined,
    };
  } catch {
    // Preserve the existing compatibility behavior: malformed optional JSON
    // is treated as an empty body rather than failing the worker request.
    return {};
  }
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
    // The route is middleware-public, so authenticate before reading any body.
    if (!isAuthorized(request)) {
      return NextResponse.json(
        { ok: false, error: 'Unauthorized' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const body = await readOptionalBoundedBody(request);
    return await execute(request, body);
  } catch (error) {
    if (error instanceof PublicRequestError) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: error.status, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    console.error('Search index worker failed.');
    return NextResponse.json(
      { ok: false, error: safeError(error) },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
