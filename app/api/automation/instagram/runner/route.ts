import { NextRequest, NextResponse } from 'next/server';

import { runInstagramAutomations } from '@/lib/automation/instagram-operations';
import { bearerMatchesAnySecret } from '@/lib/security/machine-bearer-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function isAuthorized(request: NextRequest) {
  const authorization = request.headers.get('authorization');
  const secrets = [
    process.env.INSTAGRAM_AUTOMATION_RUNNER_SECRET,
    process.env.CRON_SECRET,
  ]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  if (!secrets.length) {
    throw new Error('INSTAGRAM_AUTOMATION_RUNNER_SECRET or CRON_SECRET is not configured.');
  }

  return bearerMatchesAnySecret(authorization, secrets);
}

export async function GET(request: NextRequest) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json(
        { ok: false, error: 'Unauthorized.' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const result = await runInstagramAutomations({ maxRuns: 10 });

    return NextResponse.json(result, {
      status: result.ok ? 200 : 207,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('INSTAGRAM_AUTOMATION_RUNNER_FAILED', error);
    return NextResponse.json(
      { ok: false, error: 'Instagram automation runner is unavailable.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
