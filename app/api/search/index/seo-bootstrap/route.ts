import { NextRequest, NextResponse } from 'next/server';

import { runSearchIndexWorkerForOrganization } from '@/lib/search/opensearch';
import { ensureSeoOpenSearchMapping, searchTenantSeoOpenSearch } from '@/lib/search/seo';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const ALLOWED_BRANCH = 'feature/opensearch-aws-sigv4-v1';
const PILOT_SLUG = 'yogakulam-academy';
const FOREIGN_SLUG = 'test-yoga-school';

function expectedSecret() {
  return process.env.SEARCH_INDEX_WORKER_SECRET?.trim() || process.env.CRON_SECRET?.trim() || null;
}

function authorized(request: NextRequest) {
  const secret = expectedSecret();
  if (!secret) return false;
  const authorization = request.headers.get('authorization') || '';
  return authorization === `Bearer ${secret}`;
}

async function resolveOrganizationId(slug: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('organizations')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();

  if (error) throw new Error(`organization_resolve_failed:${slug}:${error.message}`);
  if (!data?.id) throw new Error(`organization_not_found:${slug}`);
  return String(data.id);
}

export async function GET() {
  if (process.env.VERCEL_ENV === 'production' || process.env.VERCEL_GIT_COMMIT_REF !== ALLOWED_BRANCH) {
    return NextResponse.json({ ok: false, error: 'Not available in this environment.' }, { status: 404 });
  }

  try {
    const [organizationId, foreignOrganizationId] = await Promise.all([
      resolveOrganizationId(PILOT_SLUG),
      resolveOrganizationId(FOREIGN_SLUG),
    ]);

    const mapping = await ensureSeoOpenSearchMapping();
    const worker = await runSearchIndexWorkerForOrganization(organizationId);
    const [pilot, foreign] = await Promise.all([
      searchTenantSeoOpenSearch({ organizationId, mode: 'content', size: 10 }),
      searchTenantSeoOpenSearch({ organizationId: foreignOrganizationId, mode: 'content', size: 10 }),
    ]);

    const pilotTenantSafe = pilot.items.every(
      (item) => String(item.source.organization_id ?? '') === organizationId,
    );
    const foreignTenantSafe = foreign.items.every(
      (item) => String(item.source.organization_id ?? '') === foreignOrganizationId,
    );
    const ok = Boolean(mapping.ok)
      && worker.ok
      && worker.succeeded > 0
      && pilot.total > 0
      && foreign.total === 0
      && pilotTenantSafe
      && foreignTenantSafe;

    return NextResponse.json({
      ok,
      mapping: { ok: mapping.ok, fields: mapping.fields },
      worker: {
        claimed: worker.claimed,
        succeeded: worker.succeeded,
        failed: worker.failed,
      },
      pilot: {
        total: pilot.total,
        returned: pilot.items.length,
        tenantSafe: pilotTenantSafe,
        tookMs: pilot.tookMs,
      },
      adversarialForeignTenant: {
        total: foreign.total,
        returned: foreign.items.length,
        tenantSafe: foreignTenantSafe,
        tookMs: foreign.tookMs,
      },
    }, { status: ok ? 200 : 207, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'SEO OpenSearch pilot verification failed.',
      },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized.' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  try {
    const result = await ensureSeoOpenSearchMapping();
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Unable to bootstrap SEO search mapping.',
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
