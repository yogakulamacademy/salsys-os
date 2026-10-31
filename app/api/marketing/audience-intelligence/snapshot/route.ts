import { NextRequest, NextResponse } from 'next/server';

import { captureAudienceSnapshots } from '@/lib/marketing/audience-history';
import { getLiveAudienceIntelligence } from '@/lib/marketing/live-audience-intelligence';
import { bearerMatchesAnySecret } from '@/lib/security/machine-bearer-auth';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function isAuthorized(request: NextRequest) {
  const authorization = request.headers.get('authorization');
  const secrets = [
    process.env.MARKETING_INTELLIGENCE_SYNC_SECRET,
    process.env.CRON_SECRET,
  ]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  if (secrets.length === 0) {
    throw new Error('MARKETING_INTELLIGENCE_SYNC_SECRET or CRON_SECRET is not configured.');
  }

  return bearerMatchesAnySecret(authorization, secrets);
}

export async function GET(request: NextRequest) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient() as any;
    const organizationsResult = await admin
      .from('organizations')
      .select('id')
      .order('created_at', { ascending: true });

    if (organizationsResult.error) {
      throw new Error(`Organization lookup failed: ${organizationsResult.error.message}`);
    }

    const organizations = (organizationsResult.data ?? []) as Array<{ id: string }>;
    const results: Array<{ organizationId: string; status: 'captured' | 'failed'; rows?: number; error?: string }> = [];

    for (const organization of organizations) {
      try {
        const intelligence = await getLiveAudienceIntelligence(organization.id);
        const captured = await captureAudienceSnapshots(organization.id, intelligence.segments);
        results.push({ organizationId: organization.id, status: 'captured', rows: captured.rows });
      } catch (error) {
        results.push({
          organizationId: organization.id,
          status: 'failed',
          error: error instanceof Error ? error.message.slice(0, 240) : 'unknown_error',
        });
      }
    }

    const failed = results.filter((result) => result.status === 'failed').length;
    return NextResponse.json({
      ok: failed === 0,
      organizations: results.length,
      captured: results.length - failed,
      failed,
      // No person, lead, contact identifier or segment member list is returned.
      checkedAt: new Date().toISOString(),
    }, { status: failed === 0 ? 200 : 207 });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message.slice(0, 240) : 'snapshot_failed',
    }, { status: 500 });
  }
}
