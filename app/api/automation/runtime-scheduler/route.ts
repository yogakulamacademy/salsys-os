import { NextRequest, NextResponse } from 'next/server';

import { runRuntimeSchedulerApi } from '@/lib/automation/runtime-scheduler-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const result = await runRuntimeSchedulerApi(request.headers.get('authorization'));
  return NextResponse.json(result.body, { status: result.status });
}
