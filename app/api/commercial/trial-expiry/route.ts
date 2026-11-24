import { NextRequest, NextResponse } from 'next/server';
import { bearerMatchesAnySecret } from '@/lib/security/machine-bearer-auth';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || !bearerMatchesAnySecret(request.headers.get('authorization'), [secret])) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  // Separate from signup: existing trials must still expire if signup is paused.
  if (process.env.SALSYS_TRIAL_RECONCILIATION_ENABLED !== 'true') {
    return NextResponse.json({ ok: true, skipped: 'Trial reconciliation disabled' });
  }
  try {
    const { data, error } = await createAdminClient().rpc('reconcile_expired_signup_trials_v1', { p_limit: 100 });
    if (error || !data || typeof data !== 'object' ||
        !Number.isInteger(data.checked) || !Number.isInteger(data.converted) || !Number.isInteger(data.failed)) {
      return NextResponse.json({ ok: false, error: 'Trial reconciliation unavailable' }, { status: 503 });
    }
    const summary = { checked: data.checked, converted: data.converted, failed: data.failed };
    console.info('trial_reconciliation', summary);
    return NextResponse.json({ ok: summary.failed === 0, ...summary }, { status: summary.failed === 0 ? 200 : 503 });
  } catch {
    return NextResponse.json({ ok: false, error: 'Trial reconciliation unavailable' }, { status: 503 });
  }
}
