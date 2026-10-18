import { NextRequest, NextResponse } from 'next/server';

import { searchTenantOpenSearch } from '@/lib/search/query';
import { createAdminClient } from '@/lib/supabase/admin';

const PILOT_SLUG = 'yogakulam-academy';
const FOREIGN_SLUG = 'salsysos';
const PROBE_QUERY = 'India';

function authorized(request: NextRequest) {
  const expected = process.env.SEARCH_INDEX_WORKER_SECRET?.trim();
  if (!expected) return false;
  return request.headers.get('authorization') === `Bearer ${expected}`;
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

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 });
  }

  try {
    const [pilotOrganizationId, foreignOrganizationId] = await Promise.all([
      resolveOrganizationId(PILOT_SLUG),
      resolveOrganizationId(FOREIGN_SLUG),
    ]);

    const pilot = await searchTenantOpenSearch({
      organizationId: pilotOrganizationId,
      query: PROBE_QUERY,
      entityTypes: ['lead'],
      size: 10,
    });

    const foreign = await searchTenantOpenSearch({
      organizationId: foreignOrganizationId,
      query: PROBE_QUERY,
      entityTypes: ['lead'],
      size: 10,
    });

    const pilotTenantSafe = pilot.items.every(
      (item) => String(item.source.organization_id ?? '') === pilotOrganizationId,
    );
    const foreignTenantSafe = foreign.items.every(
      (item) => String(item.source.organization_id ?? '') === foreignOrganizationId,
    );

    return NextResponse.json({
      ok: pilot.total > 0 && foreign.total === 0 && pilotTenantSafe && foreignTenantSafe,
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
    });
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
