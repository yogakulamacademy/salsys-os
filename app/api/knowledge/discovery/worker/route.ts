import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { bearerMatchesAnySecret } from '@/lib/security/machine-bearer-auth';
import { processOneDiscoveryPage } from '@/lib/knowledge-discovery/runner';
import { parseWebsiteSeed } from '@/lib/knowledge-discovery/url-policy';
import { discoveryPilotEnabled, discoveryHostAllowed } from '@/lib/knowledge-discovery/pilot-gate';
import { discoveryDomainVerified, discoveryVerificationHost } from '@/lib/knowledge-discovery/domain-verification';
import { discoverySiteConsentActive } from '@/lib/knowledge-discovery/site-consent';
import type { DiscoveryClaim } from '@/lib/knowledge-discovery/run-core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const noStore = { 'Cache-Control': 'no-store' };
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

/**
 * Database claims are privileged, but the HTTP RPC response is still a runtime
 * boundary. Fail closed on missing tenant/lease IDs or invalid page limits
 * instead of accepting a malformed lease as an idle queue or running a fetch.
 */
function validDiscoveryClaim(value: unknown): value is DiscoveryClaim {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const claim = value as Record<string, unknown>;
  return typeof claim.job_id === 'string' && UUID.test(claim.job_id)
    && typeof claim.organization_id === 'string' && UUID.test(claim.organization_id)
    && typeof claim.lease_token === 'string' && UUID.test(claim.lease_token)
    && typeof claim.seed_url === 'string' && claim.seed_url.length > 0
    && claim.seed_url.length <= 2048
    && typeof claim.max_pages === 'number' && Number.isSafeInteger(claim.max_pages)
    && claim.max_pages >= 1 && claim.max_pages <= 50;
}

/** Service-only runner. Configure a scheduler separately after deployment review. */
export async function POST(request: NextRequest) {
  // Emergency stop: refuse to claim any job before touching the database.
  if (!discoveryPilotEnabled()) return NextResponse.json(
    { ok: false, error: 'Discovery pilot disabled' }, { status: 503, headers: noStore },
  );
  // Isolate this privileged crawler from the shared CRON_SECRET used by
  // unrelated jobs. A future scheduler MUST supply the dedicated runner
  // credential after an independent operational review, not a generic token.
  const runnerSecret = process.env.KNOWLEDGE_DISCOVERY_RUNNER_SECRET?.trim();
  if (!runnerSecret) return NextResponse.json(
    { ok: false, error: 'Runner not configured' }, { status: 503, headers: noStore },
  );
  if (!bearerMatchesAnySecret(request.headers.get('authorization'), [runnerSecret])) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401, headers: noStore });
  }
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc('claim_knowledge_discovery_job_v1');
    if (error) throw error;
    // The table RPC returns [] only for a genuinely idle queue. Any other
    // non-singleton or structurally incomplete result is a service error,
    // never an idle acknowledgement and never permission to run a fetch.
    if (!Array.isArray(data) || data.length > 1) return NextResponse.json(
      { ok: false, error: 'Discovery claim unavailable' }, { status: 503, headers: noStore },
    );
    if (data.length === 0) return NextResponse.json(
      { ok: true, state: 'idle' }, { headers: noStore },
    );
    const claim: unknown = data[0];
    if (!validDiscoveryClaim(claim)) return NextResponse.json(
      { ok: false, error: 'Discovery claim unavailable' }, { status: 503, headers: noStore },
    );
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
      const consent = await admin.from('knowledge_discovery_site_consents')
        .select('organization_id,hostname,purpose,status,policy_version,granted_by,granted_at,valid_until,withdrawn_at')
        .eq('organization_id',claim.organization_id)
        .eq('hostname',discoveryVerificationHost(site.hostname)).maybeSingle();
      if (consent.error) throw consent.error;
      if (!discoverySiteConsentActive(
        consent.data,claim.organization_id,discoveryVerificationHost(site.hostname),
      )) {
        return NextResponse.json({ok:false,error:'Website discovery consent missing or inactive'},
          {status:403,headers:noStore});
      }
      // The processing adapter repeats consent validation before each new
      // network request. SQL commit rechecks it atomically with page writes.
      const outcome = await processOneDiscoveryPage(claim);
      // A declined SQL commit (cancelled consent, stale lease, concurrent
      // page update) must never look like a successful worker tick. The
      // existing SQL owns retry/lease expiration; don't claim success or
      // expose private lease data while that transaction is unresolved.
      if (!outcome || outcome.ok !== true) {
        return NextResponse.json(
          { ok: false, error: 'Discovery page commit was not acknowledged' },
          { status: 503, headers: noStore },
        );
      }
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

// GET (and implicitly HEAD) must never claim a lease or start network work.
// No scheduler is currently authorized; a future POST-only dispatcher needs
// a separate reviewed dedicated-secret setup and explicit owner approval.
export function GET() {
  return NextResponse.json(
    { ok: false, error: 'Method not allowed' },
    { status: 405, headers: { ...noStore, Allow: 'POST' } },
  );
}
