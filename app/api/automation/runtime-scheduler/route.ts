import { NextRequest, NextResponse } from 'next/server';

import { runProductionAutomationSchedulerSweep } from '@/lib/automation/runtime-scheduler';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function isAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    throw new Error('CRON_SECRET is not configured.');
  }

  return request.headers.get('authorization') === `Bearer ${secret}`;
}

function schedulerEnabled() {
  return process.env.AUTOMATION_SCHEDULER_ENABLED?.trim().toLowerCase() === 'true';
}

function boundedInt(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(Math.trunc(parsed), max));
}

export async function GET(request: NextRequest) {
  const startedAt = new Date().toISOString();

  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    if (!schedulerEnabled()) {
      return NextResponse.json({
        ok: true,
        enabled: false,
        startedAt,
        finishedAt: new Date().toISOString(),
        message: 'Automation scheduler is globally disabled.',
        workflowsScanned: 0,
        candidatesFound: 0,
        jobsClaimed: 0,
        jobsCompleted: 0,
        jobsRequeued: 0,
        jobsFailed: 0,
        jobsSkipped: 0,
      });
    }

    const workflowsLimit = boundedInt(
      process.env.AUTOMATION_SCHEDULER_WORKFLOWS_LIMIT,
      25,
      1,
      100,
    );
    const jobsPerWorkflow = boundedInt(
      process.env.AUTOMATION_SCHEDULER_JOBS_PER_WORKFLOW,
      5,
      1,
      25,
    );

    const admin = createAdminClient();
    const result = await runProductionAutomationSchedulerSweep(admin, {
      workflowsLimit,
      jobsPerWorkflow,
    });

    return NextResponse.json({
      ok: result.jobsFailed === 0,
      enabled: true,
      startedAt,
      finishedAt: new Date().toISOString(),
      workflowsLimit,
      jobsPerWorkflow,
      workflowsScanned: result.workflowsScanned,
      candidatesFound: result.candidatesFound,
      jobsClaimed: result.jobsClaimed,
      jobsCompleted: result.jobsCompleted,
      jobsRequeued: result.jobsRequeued,
      jobsFailed: result.jobsFailed,
      jobsSkipped: result.jobsSkipped,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown automation scheduler error';
    console.error('Automation runtime scheduler failed:', error);

    return NextResponse.json(
      {
        ok: false,
        enabled: schedulerEnabled(),
        startedAt,
        finishedAt: new Date().toISOString(),
        error: message,
      },
      { status: 500 },
    );
  }
}
