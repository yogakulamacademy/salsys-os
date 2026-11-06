import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { bearerMatchesAnySecret } from '@/lib/security/machine-bearer-auth';
import { processOneDiscoveryPage } from '@/lib/knowledge-discovery/runner';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const noStore = { 'Cache-Control': 'no-store' };

/** Service-only runner. Configure a scheduler separately after deployment review. */
export async function POST(request: NextRequest) {
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
