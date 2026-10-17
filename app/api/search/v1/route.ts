import { NextRequest, NextResponse } from 'next/server';

import { searchTenantOpenSearch } from '@/lib/search/query';
import { requireSingleActiveTenant } from '@/lib/tenant/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function parseInteger(value: string | null, fallback: number) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function safePublicError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Search failed.';
  if (message === 'AUTH_REQUIRED') return { status: 401, error: 'Authentication required.' };
  if (message === 'ACTIVE_TENANT_REQUIRED') return { status: 403, error: 'An active organization is required.' };
  if (message === 'MULTIPLE_ACTIVE_TENANTS') return { status: 409, error: 'Account tenant configuration requires attention.' };
  if (message === 'TENANT_RESOLUTION_FAILED') return { status: 500, error: 'Unable to resolve organization.' };
  if (message === 'SEARCH_TENANT_FILTER_VIOLATION') return { status: 500, error: 'Search safety check failed.' };
  return { status: 500, error: 'Search is temporarily unavailable.' };
}

export async function GET(request: NextRequest) {
  try {
    const tenant = await requireSingleActiveTenant();
    const params = request.nextUrl.searchParams;
    const query = (params.get('q') || '').trim().slice(0, 500);
    const entityTypes = params
      .getAll('type')
      .flatMap((value) => value.split(','))
      .map((value) => value.trim())
      .filter(Boolean);

    if (!query) {
      return NextResponse.json(
        { ok: true, query: '', total: 0, took_ms: 0, items: [] },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const result = await searchTenantOpenSearch({
      organizationId: tenant.organizationId,
      query,
      entityTypes,
      size: parseInteger(params.get('limit'), 20),
      offset: parseInteger(params.get('offset'), 0),
    });

    return NextResponse.json(
      {
        ok: true,
        query,
        total: result.total,
        took_ms: result.tookMs,
        items: result.items,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    const safe = safePublicError(error);
    return NextResponse.json(
      { ok: false, error: safe.error },
      { status: safe.status, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
