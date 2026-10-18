import { NextRequest, NextResponse } from 'next/server';

import { getRankProviderControl, saveRankProviderSettings, testRankProvider } from '@/lib/seo/rank-provider-control';
import { requireSingleActiveTenant } from '@/lib/tenant/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MUTATION_ROLES = new Set(['owner', 'admin', 'manager']);

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Ranking provider control failed.';
  if (message === 'AUTH_REQUIRED') return { status: 401, error: 'Authentication required.' };
  if (message === 'ACTIVE_TENANT_REQUIRED') return { status: 403, error: 'An active organization is required.' };
  if (message === 'MULTIPLE_ACTIVE_TENANTS') return { status: 409, error: 'Account tenant configuration requires attention.' };
  if (message === 'SEO_RANK_PROVIDER_NOT_CONFIGURED') return { status: 409, error: 'Configure the server-side ranking provider before enabling live checks.' };
  if (message === 'SEO_RANK_PROVIDER_HEALTH_REQUIRED') return { status: 409, error: 'Run a successful provider test before enabling live checks.' };
  if (message === 'SEO_RANK_SURFACE_DISABLED') return { status: 409, error: 'This ranking surface is disabled in provider settings.' };
  if (message.includes('SEO_RANK_QUERY_INVALID')) return { status: 400, error: 'Enter a valid test query.' };
  return { status: 503, error: 'Ranking provider control is temporarily unavailable.' };
}

export async function GET() {
  try {
    const tenant = await requireSingleActiveTenant();
    const result = await getRankProviderControl(tenant.organizationId);
    return NextResponse.json({ ok: true, ...result }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const safe = safeError(error);
    return NextResponse.json({ ok: false, error: safe.error }, { status: safe.status, headers: { 'Cache-Control': 'no-store' } });
  }
}

export async function POST(request: NextRequest) {
  try {
    const tenant = await requireSingleActiveTenant();
    if (!MUTATION_ROLES.has(tenant.role)) {
      return NextResponse.json({ ok: false, error: 'You do not have permission to change ranking provider settings.' }, { status: 403 });
    }
    const body = await request.json() as Record<string, unknown>;
    const action = typeof body.action === 'string' ? body.action : '';

    if (action === 'save_settings') {
      const result = await saveRankProviderSettings({
        organizationId: tenant.organizationId,
        enabled: typeof body.enabled === 'boolean' ? body.enabled : undefined,
        seoEnabled: typeof body.seo_enabled === 'boolean' ? body.seo_enabled : undefined,
        aeoEnabled: typeof body.aeo_enabled === 'boolean' ? body.aeo_enabled : undefined,
        geoEnabled: typeof body.geo_enabled === 'boolean' ? body.geo_enabled : undefined,
        minIntervalMinutes: typeof body.min_interval_minutes === 'number' ? body.min_interval_minutes : undefined,
        maxChecksPerHour: typeof body.max_checks_per_hour === 'number' ? body.max_checks_per_hour : undefined,
        maxChecksPerDay: typeof body.max_checks_per_day === 'number' ? body.max_checks_per_day : undefined,
        testQuery: typeof body.test_query === 'string' ? body.test_query : undefined,
        testCountryCode: typeof body.test_country_code === 'string' ? body.test_country_code : undefined,
        testLocale: typeof body.test_locale === 'string' ? body.test_locale : undefined,
      });
      return NextResponse.json({ ok: true, settings: result });
    }

    if (action === 'test_provider') {
      const surface = body.surface === 'aeo' || body.surface === 'geo' ? body.surface : 'seo';
      const result = await testRankProvider({
        organizationId: tenant.organizationId,
        userId: tenant.userId,
        surface,
        query: String(body.query || ''),
        countryCode: typeof body.country_code === 'string' ? body.country_code : undefined,
        locale: typeof body.locale === 'string' ? body.locale : undefined,
        device: body.device === 'mobile' ? 'mobile' : 'desktop',
      });
      return NextResponse.json({ ok: true, health: result });
    }

    return NextResponse.json({ ok: false, error: 'Unsupported action.' }, { status: 400 });
  } catch (error) {
    const safe = safeError(error);
    return NextResponse.json({ ok: false, error: safe.error }, { status: safe.status, headers: { 'Cache-Control': 'no-store' } });
  }
}
