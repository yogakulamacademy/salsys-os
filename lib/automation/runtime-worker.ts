import type { SupabaseClient } from '@supabase/supabase-js';

type Json = Record<string, unknown>;

type ClaimedJob = {
  id: string;
  organization_id: string;
  workflow_id: string;
  enrollment_id: string | null;
  wait_state_id: string | null;
  lead_id: string;
  job_type: 'resume_wait' | 'resume_reply_timeout' | 'workflow_wakeup';
  status: string;
  attempt_count: number;
  max_attempts: number;
  payload: Json | null;
};

export type WorkerResult = {
  jobId: string;
  status: 'completed' | 'requeued' | 'failed' | 'skipped';
  message: string;
  enrollmentId?: string;
  flowVersion?: number;
  targetNodeLabel?: string;
};

function json(value: unknown): Json {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {};
}

async function markJobCompleted(admin: SupabaseClient, job: ClaimedJob, payload: Json) {
  const { error } = await admin
    .from('automation_scheduled_jobs')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      last_error: null,
      payload: { ...json(job.payload), ...payload },
    })
    .eq('organization_id', job.organization_id)
    .eq('id', job.id)
    .eq('status', 'claimed');

  if (error) throw error;
}

async function failOrRequeueJob(admin: SupabaseClient, job: ClaimedJob, errorMessage: string) {
  const attempts = Number(job.attempt_count ?? 0);
  const maxAttempts = Number(job.max_attempts ?? 3);
  const exhausted = attempts >= maxAttempts;

  const retryDelaySeconds = Math.min(3600, Math.max(30, 30 * 2 ** Math.max(0, attempts - 1)));
  const scheduledFor = new Date(Date.now() + retryDelaySeconds * 1000).toISOString();

  const { error } = await admin
    .from('automation_scheduled_jobs')
    .update(
      exhausted
        ? {
            status: 'failed',
            last_error: errorMessage.slice(0, 2000),
          }
        : {
            status: 'scheduled',
            claimed_at: null,
            scheduled_for: scheduledFor,
            last_error: errorMessage.slice(0, 2000),
          },
    )
    .eq('organization_id', job.organization_id)
    .eq('id', job.id)
    .eq('status', 'claimed');

  if (error) throw error;

  return {
    jobId: job.id,
    status: exhausted ? ('failed' as const) : ('requeued' as const),
    message: exhausted
      ? `Job failed after ${attempts} attempts: ${errorMessage}`
      : `Job requeued after attempt ${attempts}; retry in ${retryDelaySeconds} seconds.`,
  };
}

async function getRuntimeContext(admin: SupabaseClient, job: ClaimedJob) {
  if (!job.enrollment_id || !job.wait_state_id) {
    throw new Error('Scheduled job is missing enrollment_id or wait_state_id.');
  }

  const [{ data: enrollment, error: enrollmentError }, { data: wait, error: waitError }] = await Promise.all([
    admin
      .from('automation_enrollments')
      .select('id,organization_id,workflow_id,lead_id,status,flow_version,current_node_id,next_action_at,metadata')
      .eq('organization_id', job.organization_id)
      .eq('workflow_id', job.workflow_id)
      .eq('id', job.enrollment_id)
      .maybeSingle(),
    admin
      .from('automation_wait_states')
      .select('id,organization_id,workflow_id,enrollment_id,lead_id,wait_type,status,resume_at,timeout_at,metadata')
      .eq('organization_id', job.organization_id)
      .eq('workflow_id', job.workflow_id)
      .eq('id', job.wait_state_id)
      .maybeSingle(),
  ]);

  if (enrollmentError || !enrollment) throw new Error(enrollmentError?.message || 'Enrollment not found.');
  if (waitError || !wait) throw new Error(waitError?.message || 'Wait state not found.');
  if (enrollment.status !== 'active') throw new Error(`Enrollment is ${enrollment.status}, not active.`);
  if (!enrollment.current_node_id) throw new Error('Enrollment has no current node.');
  if (wait.enrollment_id !== enrollment.id) throw new Error('Wait state does not belong to the enrollment.');

  const [{ data: version, error: versionError }, { data: currentNode, error: nodeError }] = await Promise.all([
    admin
      .from('automation_flow_versions')
      .select('status')
      .eq('organization_id', job.organization_id)
      .eq('workflow_id', job.workflow_id)
      .eq('version_number', enrollment.flow_version)
      .maybeSingle(),
    admin
      .from('automation_flow_nodes')
      .select('id,node_key,node_type,label,config,enabled')
      .eq('organization_id', job.organization_id)
      .eq('workflow_id', job.workflow_id)
      .eq('version_number', enrollment.flow_version)
      .eq('id', enrollment.current_node_id)
      .maybeSingle(),
  ]);

  if (versionError || !version || version.status !== 'published') {
    throw new Error(versionError?.message || 'Enrollment is not pinned to a published flow version.');
  }
  if (nodeError || !currentNode || currentNode.enabled !== true) {
    throw new Error(nodeError?.message || 'Current published node is missing or disabled.');
  }

  return { enrollment, wait, currentNode };
}

async function getSingleOutgoingTarget(admin: SupabaseClient, job: ClaimedJob, flowVersion: number, sourceNodeId: string) {
  const { data: edges, error: edgeError } = await admin
    .from('automation_flow_edges')
    .select('id,target_node_id,label,condition,priority')
    .eq('organization_id', job.organization_id)
    .eq('workflow_id', job.workflow_id)
    .eq('version_number', flowVersion)
    .eq('source_node_id', sourceNodeId)
    .order('priority', { ascending: true })
    .limit(2);

  if (edgeError) throw edgeError;
  if ((edges ?? []).length !== 1) {
    throw new Error(`Expected exactly one outgoing edge; found ${(edges ?? []).length}.`);
  }

  const edge = edges![0];
  const { data: targetNode, error: targetError } = await admin
    .from('automation_flow_nodes')
    .select('id,node_key,node_type,label,config,enabled')
    .eq('organization_id', job.organization_id)
    .eq('workflow_id', job.workflow_id)
    .eq('version_number', flowVersion)
    .eq('id', edge.target_node_id)
    .maybeSingle();

  if (targetError || !targetNode || targetNode.enabled !== true) {
    throw new Error(targetError?.message || 'Published target node is missing or disabled.');
  }

  return { edge, targetNode };
}

async function processResumeWait(admin: SupabaseClient, job: ClaimedJob): Promise<WorkerResult> {
  const { enrollment, wait, currentNode } = await getRuntimeContext(admin, job);

  if (wait.wait_type !== 'delay' && wait.wait_type !== 'until') {
    throw new Error(`resume_wait requires delay/until wait; found ${wait.wait_type}.`);
  }
  if (wait.status !== 'waiting') {
    await markJobCompleted(admin, job, { worker_outcome: 'stale_wait', customer_message_sent: false });
    return { jobId: job.id, status: 'skipped', message: `Wait is already ${wait.status}; job closed without duplicate execution.` };
  }
  if (currentNode.node_type !== 'wait') {
    throw new Error(`resume_wait expected current node type wait; found ${currentNode.node_type}.`);
  }

  const { edge, targetNode } = await getSingleOutgoingTarget(admin, job, enrollment.flow_version, currentNode.id);
  const now = new Date().toISOString();

  const { data: resumed, error: waitUpdateError } = await admin
    .from('automation_wait_states')
    .update({
      status: 'resumed',
      resumed_at: now,
      metadata: {
        ...json(wait.metadata),
        worker: 'smart_trigger_runtime_v1',
        resumed_by: 'resume_wait',
        customer_message_sent: false,
      },
    })
    .eq('organization_id', job.organization_id)
    .eq('id', wait.id)
    .eq('status', 'waiting')
    .select('id')
    .maybeSingle();

  if (waitUpdateError) throw waitUpdateError;
  if (!resumed?.id) {
    await markJobCompleted(admin, job, { worker_outcome: 'lost_wait_race', customer_message_sent: false });
    return { jobId: job.id, status: 'skipped', message: 'Another worker already resolved this wait.' };
  }

  const completed = targetNode.node_type === 'end';
  const enrollmentMetadata = json(enrollment.metadata);
  const { data: moved, error: moveError } = await admin
    .from('automation_enrollments')
    .update({
      status: completed ? 'completed' : 'active',
      current_node_id: targetNode.id,
      next_action_at: null,
      last_event_at: now,
      metadata: {
        ...enrollmentMetadata,
        current_node_key: targetNode.node_key,
        current_node_type: targetNode.node_type,
        resumed_wait_node_key: currentNode.node_key,
        worker_edge_label: edge.label,
        worker: 'smart_trigger_runtime_v1',
        runtime_flow_enabled: false,
        customer_message_sent: false,
      },
    })
    .eq('organization_id', job.organization_id)
    .eq('workflow_id', job.workflow_id)
    .eq('id', enrollment.id)
    .eq('current_node_id', currentNode.id)
    .select('id')
    .maybeSingle();

  if (moveError || !moved?.id) throw new Error(moveError?.message || 'Enrollment changed while processing resume_wait.');

  await markJobCompleted(admin, job, {
    worker_outcome: 'completed',
    target_node_key: targetNode.node_key,
    customer_message_sent: false,
  });

  return {
    jobId: job.id,
    enrollmentId: enrollment.id,
    flowVersion: enrollment.flow_version,
    targetNodeLabel: targetNode.label,
    status: 'completed',
    message: `resume_wait completed and moved to ${targetNode.label}.`,
  };
}

async function processReplyTimeout(admin: SupabaseClient, job: ClaimedJob): Promise<WorkerResult> {
  const { enrollment, wait, currentNode } = await getRuntimeContext(admin, job);

  if (wait.wait_type !== 'reply') throw new Error(`resume_reply_timeout requires reply wait; found ${wait.wait_type}.`);
  if (wait.status !== 'waiting') {
    await markJobCompleted(admin, job, { worker_outcome: 'stale_reply_wait', customer_message_sent: false });
    return { jobId: job.id, status: 'skipped', message: `Reply wait is already ${wait.status}; timeout closed without duplicate execution.` };
  }
  if (currentNode.node_type !== 'wait_for_reply') {
    throw new Error(`resume_reply_timeout expected wait_for_reply; found ${currentNode.node_type}.`);
  }

  const { targetNode: conditionNode } = await getSingleOutgoingTarget(admin, job, enrollment.flow_version, currentNode.id);
  if (conditionNode.node_type !== 'condition') throw new Error(`Reply wait must feed a condition node; found ${conditionNode.node_type}.`);

  const { data: branchEdges, error: branchError } = await admin
    .from('automation_flow_edges')
    .select('id,target_node_id,label,condition,priority')
    .eq('organization_id', job.organization_id)
    .eq('workflow_id', job.workflow_id)
    .eq('version_number', enrollment.flow_version)
    .eq('source_node_id', conditionNode.id)
    .order('priority', { ascending: true });

  if (branchError) throw branchError;
  const timeoutEdge = (branchEdges ?? []).find((candidate) => json(candidate.condition).equals === 'reply_timeout');
  if (!timeoutEdge) throw new Error('Published condition has no reply_timeout branch.');

  const { data: targetNode, error: targetError } = await admin
    .from('automation_flow_nodes')
    .select('id,node_key,node_type,label,config,enabled')
    .eq('organization_id', job.organization_id)
    .eq('workflow_id', job.workflow_id)
    .eq('version_number', enrollment.flow_version)
    .eq('id', timeoutEdge.target_node_id)
    .maybeSingle();

  if (targetError || !targetNode || targetNode.enabled !== true) {
    throw new Error(targetError?.message || 'reply_timeout target node is missing or disabled.');
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const { data: expired, error: expireError } = await admin
    .from('automation_wait_states')
    .update({
      status: 'expired',
      resumed_at: nowIso,
      metadata: {
        ...json(wait.metadata),
        worker: 'smart_trigger_runtime_v1',
        resumed_by: 'reply_timeout',
        reply_outcome: 'reply_timeout',
        customer_message_sent: false,
      },
    })
    .eq('organization_id', job.organization_id)
    .eq('id', wait.id)
    .eq('status', 'waiting')
    .select('id')
    .maybeSingle();

  if (expireError) throw expireError;
  if (!expired?.id) {
    await markJobCompleted(admin, job, { worker_outcome: 'lost_reply_race', customer_message_sent: false });
    return { jobId: job.id, status: 'skipped', message: 'Reply arrived or another worker resolved the wait first.' };
  }

  const { error: variableError } = await admin.from('automation_variables').upsert(
    {
      organization_id: job.organization_id,
      workflow_id: job.workflow_id,
      enrollment_id: enrollment.id,
      lead_id: enrollment.lead_id,
      variable_key: 'reply_outcome',
      value: 'reply_timeout',
      value_type: 'string',
      source_node_id: conditionNode.id,
    },
    { onConflict: 'organization_id,enrollment_id,variable_key' },
  );
  if (variableError) throw variableError;

  let nextActionAt: string | null = null;
  let nextWaitId: string | null = null;
  let nextJobId: string | null = null;

  if (targetNode.node_type === 'wait') {
    const config = json(targetNode.config);
    const delayMinutes = Math.max(1, Math.min(Math.round(Number(config.delay_minutes ?? 10) || 10), 10080));
    nextActionAt = new Date(now.getTime() + delayMinutes * 60_000).toISOString();

    const { data: delayWait, error: delayWaitError } = await admin
      .from('automation_wait_states')
      .insert({
        organization_id: job.organization_id,
        workflow_id: job.workflow_id,
        enrollment_id: enrollment.id,
        lead_id: enrollment.lead_id,
        wait_type: 'delay',
        status: 'waiting',
        resume_at: nextActionAt,
        waiting_since: nowIso,
        metadata: {
          worker: 'smart_trigger_runtime_v1',
          flow_version: enrollment.flow_version,
          node_id: targetNode.id,
          node_key: targetNode.node_key,
          delay_minutes: delayMinutes,
          customer_message_sent: false,
        },
      })
      .select('id')
      .single();
    if (delayWaitError || !delayWait?.id) throw new Error(delayWaitError?.message || 'Unable to create follow-up delay wait.');
    nextWaitId = delayWait.id;

    const dedupeKey = `runtime-v1:resume-wait:${enrollment.id}:${delayWait.id}:v${enrollment.flow_version}`;
    const { data: nextJob, error: nextJobError } = await admin
      .from('automation_scheduled_jobs')
      .insert({
        organization_id: job.organization_id,
        workflow_id: job.workflow_id,
        enrollment_id: enrollment.id,
        wait_state_id: delayWait.id,
        lead_id: enrollment.lead_id,
        job_type: 'resume_wait',
        status: 'scheduled',
        scheduled_for: nextActionAt,
        max_attempts: 3,
        dedupe_key: dedupeKey,
        payload: {
          worker: 'smart_trigger_runtime_v1',
          flow_version: enrollment.flow_version,
          node_id: targetNode.id,
          node_key: targetNode.node_key,
          customer_message_sent: false,
        },
      })
      .select('id')
      .single();
    if (nextJobError || !nextJob?.id) {
      await admin.from('automation_wait_states').delete().eq('organization_id', job.organization_id).eq('id', delayWait.id);
      throw new Error(nextJobError?.message || 'Unable to create follow-up delay job.');
    }
    nextJobId = nextJob.id;
  }

  const completed = targetNode.node_type === 'end';
  const { data: moved, error: moveError } = await admin
    .from('automation_enrollments')
    .update({
      status: completed ? 'completed' : 'active',
      current_node_id: targetNode.id,
      next_action_at: nextActionAt,
      last_event_at: nowIso,
      metadata: {
        ...json(enrollment.metadata),
        current_node_key: targetNode.node_key,
        current_node_type: targetNode.node_type,
        condition_node_key: conditionNode.node_key,
        branch_label: timeoutEdge.label,
        reply_outcome: 'reply_timeout',
        wait_state_id: nextWaitId,
        scheduled_job_id: nextJobId,
        previous_reply_wait_id: wait.id,
        worker: 'smart_trigger_runtime_v1',
        runtime_flow_enabled: false,
        customer_message_sent: false,
      },
    })
    .eq('organization_id', job.organization_id)
    .eq('workflow_id', job.workflow_id)
    .eq('id', enrollment.id)
    .eq('current_node_id', currentNode.id)
    .select('id')
    .maybeSingle();

  if (moveError || !moved?.id) throw new Error(moveError?.message || 'Enrollment changed while processing reply timeout.');

  await markJobCompleted(admin, job, {
    worker_outcome: 'completed',
    reply_outcome: 'reply_timeout',
    target_node_key: targetNode.node_key,
    customer_message_sent: false,
  });

  return {
    jobId: job.id,
    enrollmentId: enrollment.id,
    flowVersion: enrollment.flow_version,
    targetNodeLabel: targetNode.label,
    status: 'completed',
    message: `resume_reply_timeout completed and moved to ${targetNode.label}.`,
  };
}

export async function processClaimedAutomationJob(admin: SupabaseClient, job: ClaimedJob): Promise<WorkerResult> {
  try {
    if (job.status !== 'claimed') {
      return { jobId: job.id, status: 'skipped', message: `Job status is ${job.status}, not claimed.` };
    }

    if (job.job_type === 'resume_wait') return await processResumeWait(admin, job);
    if (job.job_type === 'resume_reply_timeout') return await processReplyTimeout(admin, job);

    return await failOrRequeueJob(admin, job, `Unsupported job type: ${job.job_type}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown runtime worker error.';
    return await failOrRequeueJob(admin, job, message);
  }
}

export async function claimAndProcessAutomationJobs(
  admin: SupabaseClient,
  organizationId: string,
  options?: { limit?: number; jobId?: string | null; allowEarly?: boolean },
): Promise<WorkerResult[]> {
  const { data, error } = await admin.rpc('claim_automation_scheduled_jobs_v1', {
    p_organization_id: organizationId,
    p_limit: Math.max(1, Math.min(options?.limit ?? 10, 50)),
    p_job_id: options?.jobId ?? null,
    p_allow_early: options?.allowEarly === true,
  });

  if (error) throw error;

  const jobs = (data ?? []) as ClaimedJob[];
  const results: WorkerResult[] = [];
  for (const job of jobs) {
    results.push(await processClaimedAutomationJob(admin, job));
  }
  return results;
}
