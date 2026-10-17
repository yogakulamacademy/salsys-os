import { NextRequest, NextResponse } from 'next/server';

import { runSeoEmbeddingWorkerForOrganization } from '@/lib/search/seo-semantic';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function isAuthorized(request: NextRequest) {
  const authorization = request.headers.get('authorization');
  const secrets = [process.env.SEARCH_INDEX_WORKER_SECRET, process.env.CRON_SECRET]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  if (!secrets.length) throw new Error('Search worker authorization is not configured.');
  return secrets.some((secret) => authorization === `Bearer ${secret}`);
}

async function run(filter?: string) {
  const admin = createAdminClient();
  let query = admin.from('seo_embedding_settings').select('organization_id').eq('enabled', true);
  if (filter) query = query.eq('organization_id', filter);
  const { data, error } = await query;
  if (error) throw new Error(`Unable to resolve semantic-enabled organizations: ${error.message}`);
  const results = [];
  for (const row of data || []) {
    const organizationId = String(row.organization_id);
    try {
      results.push({ organizationId, ...(await runSeoEmbeddingWorkerForOrganization(organizationId)) });
    } catch (error) {
      results.push({
        organizationId,
        ok: false,
        skipped: false,
        claimed: 0,
        succeeded: 0,
        failed: 0,
        error: error instanceof Error ? error.message.slice(0, 500) : 'semantic_worker_failed',
      });
    }
  }
  return { ok: results.every((result) => result.ok), organizations: results.length, results };
}

async function execute(request: NextRequest, organizationId?: string) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }
  const result = await run(organizationId?.trim() || undefined);
  return NextResponse.json(result, { status: result.ok ? 200 : 207, headers: { 'Cache-Control': 'no-store' } });
}

export async function GET(request: NextRequest) {
  try {
    return await execute(request);
  } catch {
    return NextResponse.json({ ok: false, error: 'SEO semantic worker failed.' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null) as { organizationId?: unknown } | null;
    const organizationId = typeof body?.organizationId === 'string' ? body.organizationId : undefined;
    return await execute(request, organizationId);
  } catch {
    return NextResponse.json({ ok: false, error: 'SEO semantic worker failed.' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
