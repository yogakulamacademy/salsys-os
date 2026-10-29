import { NextRequest, NextResponse } from 'next/server';

import { syncInstagramGenericLeadNames } from '@/lib/integrations/instagram-profile-sync';
import { bearerMatchesAnySecret } from '@/lib/security/machine-bearer-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

function isAuthorized(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) return false;
  return bearerMatchesAnySecret(request.headers.get('authorization'), [cronSecret]);
}

async function runProfileSync(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const summary = await syncInstagramGenericLeadNames(50);

    return NextResponse.json({
      ok: summary.failed === 0,
      ...summary,
      ranAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Instagram profile name sync failed.', error);
    return NextResponse.json(
      { ok: false, error: 'Instagram profile name sync failed.' },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  return runProfileSync(request);
}

export async function POST(request: NextRequest) {
  return runProfileSync(request);
}
