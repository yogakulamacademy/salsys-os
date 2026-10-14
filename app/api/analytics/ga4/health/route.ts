import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { requireCurrentOrganizationId } from '@/lib/workspace';

export const runtime = 'nodejs';
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

    const [healthResult, runsResult] = await Promise.all([
      supabase
        .from('v_ga4_sync_health')
        .select('*')
        .eq('organization_id', organizationId)
        .maybeSingle(),

      supabase
        .from('ga4_sync_runs')
        .select(`
          id,
          property_id,
          status,
          from_date,
          to_date,
          overview_rows,
          source_rows,
          landing_page_rows,
          campaign_rows,
          country_rows,
          total_rows,
          error_message,
          started_at,
          completed_at
        `)
        .eq('organization_id', organizationId)
        .order('started_at', { ascending: false })
        .limit(10),
    ]);

    if (healthResult.error) {
      throw new Error(
        `Unable to load GA4 health: ${healthResult.error.message}`,
      );
    }

    if (runsResult.error) {
      throw new Error(
        `Unable to load GA4 sync history: ${runsResult.error.message}`,
      );
    }

    return NextResponse.json(
      {
        ok: true,
        health: healthResult.data ?? null,
        recentRuns: runsResult.data ?? [],
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown GA4 health error';

    console.error('GA4 health failed:', error);

    return NextResponse.json(
      { ok: false, error: message },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
