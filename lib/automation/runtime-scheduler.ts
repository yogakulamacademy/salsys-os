import type { SupabaseClient } from '@supabase/supabase-js';

import {
  claimAndProcessAutomationJobs,
  type WorkerResult,
} from '@/lib/automation/runtime-worker';

const supportedScheduledJobTypes = ['resume_wait', 'resume_reply_timeout'] as const;

type SchedulerSweepItem = {
  jobId: string;
  organizationId: string;
  workflowId: string;
  result: WorkerResult | null;
};

export type SchedulerSweepResult = {
  mode: 'production' | 'controlled_test';
  workflowsScanned: number;
  candidatesFound: number;
  jobsClaimed: number;
  jobsCompleted: number;
  jobsRequeued: number;
  jobsFailed: number;
  jobsSkipped: number;
  items: SchedulerSweepItem[];
};

function emptyResult(mode: SchedulerSweepResult['mode']): SchedulerSweepResult {
  return {
    mode,
    workflowsScanned: 0,
    candidatesFound: 0,
    jobsClaimed: 0,
    jobsCompleted: 0,
    jobsRequeued: 0,
    jobsFailed: 0,
    jobsSkipped: 0,
    items: [],
  };
}

function recordWorkerResult(result: SchedulerSweepResult, item: SchedulerSweepItem) {
  result.items.push(item);
  if (!item.result) return;

  result.jobsClaimed += 1;
  if (item.result.status === 'completed') result.jobsCompleted += 1;
  if (item.result.status === 'requeued') result.jobsRequeued += 1;
  if (item.result.status === 'failed') result.jobsFailed += 1;
  if (item.result.status === 'skipped') result.jobsSkipped += 1;
}

export async function runProductionAutomationSchedulerSweep(
  admin: SupabaseClient,
  options?: {
    organizationId?: string;
    workflowsLimit?: number;
    jobsPerWorkflow?: number;
  },
): Promise<SchedulerSweepResult> {
  const result = emptyResult('production');
  const workflowsLimit = Math.max(1, Math.min(options?.workflowsLimit ?? 50, 100));
  const jobsPerWorkflow = Math.max(1, Math.min(options?.jobsPerWorkflow ?? 10, 25));
  const dueBefore = new Date().toISOString();

  let workflowQuery = admin
    .from('automation_workflows')
    .select('id,organization_id')
    .eq('status', 'active')
    .eq('runtime_flow_enabled', true)
    .limit(workflowsLimit);

  if (options?.organizationId) {
    workflowQuery = workflowQuery.eq('organization_id', options.organizationId);
  }

  const { data: workflows, error: workflowError } = await workflowQuery;
  if (workflowError) throw workflowError;

  result.workflowsScanned = (workflows ?? []).length;

  for (const workflow of workflows ?? []) {
    const { data: candidates, error: candidatesError } = await admin
      .from('automation_scheduled_jobs')
      .select('id')
      .eq('organization_id', workflow.organization_id)
      .eq('workflow_id', workflow.id)
      .eq('status', 'scheduled')
      .lte('scheduled_for', dueBefore)
      .in('job_type', [...supportedScheduledJobTypes])
      .order('scheduled_for', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(jobsPerWorkflow);

    if (candidatesError) throw candidatesError;
    result.candidatesFound += (candidates ?? []).length;

    for (const candidate of candidates ?? []) {
      const workerResults = await claimAndProcessAutomationJobs(
        admin,
        workflow.organization_id,
        {
          jobId: candidate.id,
          limit: 1,
          allowEarly: false,
        },
      );

      recordWorkerResult(result, {
        jobId: candidate.id,
        organizationId: workflow.organization_id,
        workflowId: workflow.id,
        result: workerResults[0] ?? null,
      });
    }
  }

  return result;
}

export async function runControlledAutomationSchedulerSweep(
  admin: SupabaseClient,
  organizationId: string,
  options?: { limit?: number },
): Promise<SchedulerSweepResult> {
  const result = emptyResult('controlled_test');
  const limit = Math.max(1, Math.min(options?.limit ?? 10, 25));
  const dueBefore = new Date().toISOString();

  const { data: candidates, error } = await admin
    .from('automation_scheduled_jobs')
    .select('id,workflow_id')
    .eq('organization_id', organizationId)
    .eq('status', 'scheduled')
    .eq('payload->>source', 'runtime_scheduler_controlled_test')
    .lte('scheduled_for', dueBefore)
    .in('job_type', [...supportedScheduledJobTypes])
    .order('scheduled_for', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) throw error;

  result.workflowsScanned = new Set((candidates ?? []).map((candidate) => candidate.workflow_id)).size;
  result.candidatesFound = (candidates ?? []).length;

  for (const candidate of candidates ?? []) {
    const workerResults = await claimAndProcessAutomationJobs(admin, organizationId, {
      jobId: candidate.id,
      limit: 1,
      allowEarly: false,
    });

    recordWorkerResult(result, {
      jobId: candidate.id,
      organizationId,
      workflowId: candidate.workflow_id,
      result: workerResults[0] ?? null,
    });
  }

  return result;
}
