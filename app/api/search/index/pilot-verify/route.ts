import { NextResponse } from 'next/server';

import { searchTenantOpenSearch } from '@/lib/search/query';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PILOT_SLUG = 'yogakulam-academy';
const FOREIGN_SLUG = 'test-yoga-school';
const PROBE_QUERY = 'India';
const ALLOWED_BRANCH = 'feature/opensearch-aws-sigv4-v1';

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
    const [pilotOrganizationId, foreignOrganizationId] = await Promise.all([
      resolveOrganizationId(PILOT_SLUG),
      resolveOrganizationId(FOREIGN_SLUG),
    ]);

    const [pilot, foreign] = await Promise.all([
      searchTenantOpenSearch({
        organizationId: pilotOrganizationId,
        query: PROBE_QUERY,
        entityTypes: ['lead'],
        size: 10,
      }),
      searchTenantOpenSearch({
        organizationId: foreignOrganizationId,
        query: PROBE_QUERY,
        entityTypes: ['lead'],
        size: 10,
      }),
    ]);

    const pilotTenantSafe = pilot.items.every(
      (item) => String(item.source.organization_id ?? '') === pilotOrganizationId,
    );
    const foreignTenantSafe = foreign.items.every(
      (item) => String(item.source.organization_id ?? '') === foreignOrganizationId,
    );
    const ok = pilot.total > 0 && foreign.total === 0 && pilotTenantSafe && foreignTenantSafe;

    return NextResponse.json({
      ok,
      query: PROBE_QUERY,
      pilot: {
        slug: PILOT_SLUG,
        total: pilot.total,
        returned: pilot.items.length,
        tookMs: pilot.tookMs,
        tenantSafe: pilotTenantSafe,
      },
      adversarialForeignTenant: {
        slug: FOREIGN_SLUG,
        total: foreign.total,
        returned: foreign.items.length,
        tookMs: foreign.tookMs,
        tenantSafe: foreignTenantSafe,
      },
    }, { status: ok ? 200 : 207 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'OpenSearch pilot verification failed.',
      },
      { status: 500 },
    );
  }
}
