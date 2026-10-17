import { NextRequest, NextResponse } from 'next/server';

import { searchTenantOpenSearch } from '@/lib/search/query';
import { createAdminClient } from '@/lib/supabase/admin';
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

function safeTelemetryErrorCode(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (message === 'SEARCH_TENANT_FILTER_VIOLATION') return 'tenant_filter_violation';
  if (message.startsWith('OpenSearch query failed with HTTP ')) return 'opensearch_query_failed';
  if (message.toLowerCase().includes('opensearch')) return 'opensearch_unavailable';
  return 'search_unavailable';
}

function telemetryEntityTypes(values: string[]) {
  return Array.from(
    new Set(
      values
        .map((value) => value.trim().toLowerCase().slice(0, 50))
        .filter(Boolean),
    ),
  ).slice(0, 10);
}

async function recordSearchTelemetry(input: {
  organizationId: string;
  queryLength: number;
  entityTypes: string[];
  resultCount: number;
  tookMs: number;
  outcome: 'success' | 'zero_result' | 'error';
  errorCode?: string | null;
  backendTookMs?: number | null;
}) {
  try {
    const admin = createAdminClient();
    await admin.from('search_query_events').insert({
      organization_id: input.organizationId,
      query_length: Math.max(0, Math.min(input.queryLength, 500)),
      entity_types: telemetryEntityTypes(input.entityTypes),
      result_count: Math.max(0, input.resultCount),
      took_ms: Math.max(0, Math.round(input.tookMs)),
      outcome: input.outcome,
      error_code: input.errorCode || null,
      metadata: input.backendTookMs == null
        ? {}
        : { backend_took_ms: Math.max(0, Math.round(input.backendTookMs)) },
    });
  } catch {
    // Search must never fail because observability storage is unavailable.
  }
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

    const startedAt = Date.now();

    try {
      const result = await searchTenantOpenSearch({
        organizationId: tenant.organizationId,
        query,
        entityTypes,
        size: parseInteger(params.get('limit'), 20),
        offset: parseInteger(params.get('offset'), 0),
      });

      await recordSearchTelemetry({
        organizationId: tenant.organizationId,
        queryLength: query.length,
        entityTypes,
        resultCount: result.total,
        tookMs: Date.now() - startedAt,
        outcome: result.total === 0 ? 'zero_result' : 'success',
        backendTookMs: result.tookMs,
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
    } catch (searchError) {
      await recordSearchTelemetry({
        organizationId: tenant.organizationId,
        queryLength: query.length,
        entityTypes,
        resultCount: 0,
        tookMs: Date.now() - startedAt,
        outcome: 'error',
        errorCode: safeTelemetryErrorCode(searchError),
      });
      throw searchError;
    }
  } catch (error) {
    const safe = safePublicError(error);
    return NextResponse.json(
      { ok: false, error: safe.error },
      { status: safe.status, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
