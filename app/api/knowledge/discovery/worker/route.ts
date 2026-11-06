import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { bearerMatchesAnySecret } from '@/lib/security/machine-bearer-auth';
import { processOneDiscoveryPage } from '@/lib/knowledge-discovery/runner';
import { parseWebsiteSeed } from '@/lib/knowledge-discovery/url-policy';
import { discoveryPilotEnabled, discoveryHostAllowed } from '@/lib/knowledge-discovery/pilot-gate';
import { discoveryDomainVerified, discoveryVerificationHost } from '@/lib/knowledge-discovery/domain-verification';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const noStore = { 'Cache-Control': 'no-store' };

/** Service-only runner. Configure a scheduler separately after deployment review. */
export async function POST(request: NextRequest) {
  // Emergency stop: refuse to claim any job before touching the database.
  if (!discoveryPilotEnabled()) return NextResponse.json(
    { ok: false, error: 'Discovery pilot disabled' }, { status: 503, headers: noStore },
  );
  const secrets = [
    process.env.KNOWLEDGE_DISCOVERY_RUNNER_SECRET?.trim(),
    process.env.CRON_SECRET?.trim(),
  ].filter((value): value is string => Boolean(value));
  if (!secrets.length) return NextResponse.json(
    { ok: false, error: 'Runner not configured' }, { status: 503, headers: noStore },
  );
  if (!bearerMatchesAnySecret(request.headers.get('authorization'), secrets)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401, headers: noStore });
  }
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc('claim_knowledge_discovery_job_v1');
    if (error) throw error;
    const claim = Array.isArray(data) ? data[0] : null;
    if (!claim) return NextResponse.json({ ok: true, state: 'idle' }, { headers: noStore });
    try {
      // Jobs queued under older pilot configuration must still be rechecked
      // against the currently approved host list before any outbound request.
      const site = parseWebsiteSeed(claim.seed_url);
      if (site.protocol !== 'https:' || !discoveryHostAllowed(site.hostname)) {
        return NextResponse.json({ ok: false, error: 'Discovery job site is not approved' },
          { status: 403, headers: noStore });
      }
      // Proof can expire or be replaced after a job was queued. Check it
      // before the first outbound request of every worker tick.
      const { data: proof, error: proofError } = await admin
        .from('knowledge_discovery_domain_verifications')
        .select('verified_at,verified_until')
        .eq('organization_id', claim.organization_id)
        .eq('hostname', discoveryVerificationHost(site.hostname)).maybeSingle();
      if (proofError) throw proofError;
      if (!discoveryDomainVerified(proof)) {
        return NextResponse.json({ ok: false, error: 'Website ownership proof is missing or expired' },
          { status: 403, headers: noStore });
      }
      const outcome = await processOneDiscoveryPage(claim);
      return NextResponse.json({ ok: true, state: 'processed', result: outcome }, { headers: noStore });
    } catch {
      // A lease expiry makes the job retryable. Do not set completed on error.
      // Repeated stale leases become failed after five unsuccessful claims.
      return NextResponse.json({ ok: false, error: 'Discovery worker failed; lease will expire' },
        { status: 500, headers: noStore });
    }
  } catch {
    return NextResponse.json({ ok: false, error: 'Discovery service unavailable' },
      { status: 503, headers: noStore });
  }
}

// Vercel Cron performs GET; the same bearer-secret boundary applies.
export const GET = POST;
