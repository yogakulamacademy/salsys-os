import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { requireCurrentOrganizationId } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: 'Unauthorized' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const organizationId = await requireCurrentOrganizationId(
      supabase,
      user.id,
    );

    const [
      latestDailyResult,
      overviewResult,
      runsResult,
      dailyCountResult,
      queryCountResult,
      pageCountResult,
      countryCountResult,
      deviceCountResult,
      appearanceCountResult,
    ] = await Promise.all([
      supabase
        .from('gsc_daily')
        .select('site_url,date,updated_at')
        .eq('organization_id', organizationId)
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle(),

      supabase
        .from('v_gsc_overview')
        .select('*')
        .eq('organization_id', organizationId),

      supabase
        .from('gsc_sync_runs')
        .select(`
          id,
          site_url,
          start_date,
          end_date,
          status,
          triggered_by,
          total_rows,
          error_message,
          started_at,
          completed_at
        `)
        .eq('organization_id', organizationId)
        .order('started_at', { ascending: false })
        .limit(10),

      supabase
        .from('gsc_daily')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', organizationId),

      supabase
        .from('gsc_query_daily')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', organizationId),

      supabase
        .from('gsc_page_daily')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', organizationId),

      supabase
        .from('gsc_country_daily')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', organizationId),

      supabase
        .from('gsc_device_daily')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', organizationId),

      supabase
        .from('gsc_search_appearance_daily')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', organizationId),
    ]);

    const errors = [
      latestDailyResult.error,
      overviewResult.error,
      runsResult.error,
      dailyCountResult.error,
      queryCountResult.error,
      pageCountResult.error,
      countryCountResult.error,
      deviceCountResult.error,
      appearanceCountResult.error,
    ].filter(Boolean);

    if (errors.length > 0) {
      throw new Error(errors.map((error) => error?.message).join(' | '));
    }

    return NextResponse.json(
      {
        ok: true,
        latest: {
          siteUrl: latestDailyResult.data?.site_url ?? null,
          analyticsDate: latestDailyResult.data?.date ?? null,
          updatedAt: latestDailyResult.data?.updated_at ?? null,
        },
        overview: overviewResult.data ?? [],
        counts: {
          daily: dailyCountResult.count ?? 0,
          queries: queryCountResult.count ?? 0,
          pages: pageCountResult.count ?? 0,
          countries: countryCountResult.count ?? 0,
          devices: deviceCountResult.count ?? 0,
          searchAppearance: appearanceCountResult.count ?? 0,
        },
        recentRuns: runsResult.data ?? [],
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown GSC health error';

    console.error('GSC health check failed:', error);

    return NextResponse.json(
      { ok: false, error: message },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
