import { createHash, timingSafeEqual } from 'crypto';

import { runProductionAutomationSchedulerSweep } from '@/lib/automation/runtime-scheduler';
import { createAdminClient } from '@/lib/supabase/admin';

export type RuntimeSchedulerApiResult = {
  status: number;
  body: Record<string, unknown>;
};

function schedulerEnabled() {
  return process.env.AUTOMATION_SCHEDULER_ENABLED?.trim().toLowerCase() === 'true';
}

function boundedInt(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(Math.trunc(parsed), max));
}

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function safeEqualHex(left: string, right: string) {
  if (!/^[0-9a-f]{64}$/i.test(left) || !/^[0-9a-f]{64}$/i.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

async function authorizeSchedulerRequest(authorization: string | null) {
  if (!authorization?.startsWith('Bearer ')) {
    return { authorized: false, configured: true };
  }

  const token = authorization.slice('Bearer '.length).trim();
  if (!token) return { authorized: false, configured: true };

  const envSecret = process.env.CRON_SECRET?.trim();
  if (envSecret && safeEqualHex(sha256(token), sha256(envSecret))) {
    return { authorized: true, configured: true };
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('automation_scheduler_settings')
    .select('authorization_token_sha256')
    .eq('id', 1)
    .maybeSingle();

  if (error) throw error;

  const databaseDigest = String(data?.authorization_token_sha256 ?? '').trim();
  if (databaseDigest && safeEqualHex(sha256(token), databaseDigest)) {
    return { authorized: true, configured: true };
  }

  return {
    authorized: false,
    configured: Boolean(envSecret || databaseDigest),
  };
}

export async function runRuntimeSchedulerApi(
  authorization: string | null,
): Promise<RuntimeSchedulerApiResult> {
  const startedAt = new Date().toISOString();

  try {
    const auth = await authorizeSchedulerRequest(authorization);
    if (!auth.configured) {
      return {
        status: 500,
        body: {
          ok: false,
          enabled: schedulerEnabled(),
          startedAt,
          finishedAt: new Date().toISOString(),
          error: 'Scheduler authorization is not configured.',
        },
      };
    }

    if (!auth.authorized) {
      return {
        status: 401,
        body: { ok: false, error: 'Unauthorized' },
      };
    }

    if (!schedulerEnabled()) {
      return {
        status: 200,
        body: {
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
        },
      };
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

    return {
      status: 200,
      body: {
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
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown automation scheduler error';
    console.error('Automation runtime scheduler failed:', error);

    return {
      status: 500,
      body: {
        ok: false,
        enabled: schedulerEnabled(),
        startedAt,
        finishedAt: new Date().toISOString(),
        error: message,
      },
    };
  }
}
