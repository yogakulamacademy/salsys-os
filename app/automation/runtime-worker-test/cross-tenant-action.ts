'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { requireCurrentOrganizationId } from '@/lib/workspace';

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? '').trim();
}

function go(type: 'notice' | 'error', message: string): never {
  redirect(`/automation/runtime-worker-test?${type}=${encodeURIComponent(message)}`);
}

async function adminContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) go('error', 'Your session has expired. Sign in again.');

  const organizationId = await requireCurrentOrganizationId(supabase, user.id);
  const { data: canManage } = await supabase.rpc('can_manage_organization', {
    p_organization_id: organizationId,
  });

  if (canManage !== true) {
    go('error', 'Only organization admins can run controlled runtime-worker tests.');
  }

  return { organizationId };
}

export async function runRuntimeWorkerCrossTenantTestAction(formData: FormData) {
  const jobId = value(formData, 'job_id');
  if (!jobId) go('error', 'Scheduled job is required.');

  const { organizationId } = await adminContext();
  const admin = createAdminClient();

  const { data: job, error: jobError } = await admin
    .from('automation_scheduled_jobs')
    .select('id,organization_id,status,attempt_count,claimed_at,payload,job_type')
    .eq('organization_id', organizationId)
    .eq('id', jobId)
    .maybeSingle();

  if (jobError || !job) go('error', jobError?.message || 'Scheduled job was not found in the active organization.');
  if (job.status !== 'scheduled') go('notice', `This job is already ${job.status}; prepare a fresh scheduled job for the cross-tenant test.`);

  const payload = (job.payload ?? {}) as Record<string, unknown>;
  if (payload.source !== 'runtime_worker_controlled_test' && payload.worker !== 'smart_trigger_runtime_v1') {
    go('error', 'Controlled cross-tenant test will not use unrelated scheduled jobs.');
  }

  let foreignOrganization: { id: string; name: string } | null = null;

  const { data: preferredOrg } = await admin
    .from('organizations')
    .select('id,name')
    .eq('name', 'Test Yoga School')
    .neq('id', organizationId)
    .limit(1)
    .maybeSingle();

  if (preferredOrg?.id) {
    foreignOrganization = preferredOrg as { id: string; name: string };
  } else {
    const { data: fallbackOrg, error: fallbackError } = await admin
      .from('organizations')
      .select('id,name')
      .neq('id', organizationId)
      .order('name', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (fallbackError) go('error', fallbackError.message);
    if (fallbackOrg?.id) foreignOrganization = fallbackOrg as { id: string; name: string };
  }

  if (!foreignOrganization) go('error', 'A second organization is required for the cross-tenant isolation test.');

  const beforeAttempts = Number(job.attempt_count ?? 0);
  const beforeStatus = String(job.status);
  const beforeClaimedAt = job.claimed_at;

  const { data: foreignClaim, error: foreignClaimError } = await admin.rpc('claim_automation_scheduled_jobs_v1', {
    p_organization_id: foreignOrganization.id,
    p_limit: 1,
    p_job_id: job.id,
    p_allow_early: true,
  });

  if (foreignClaimError) go('error', foreignClaimError.message);

  const claims = (foreignClaim ?? []) as Array<Record<string, unknown>>;
  if (claims.length !== 0) {
    go('error', `Cross-tenant isolation failed: ${foreignOrganization.name} scope claimed a job owned by the active organization. Automatic runtime remains disabled.`);
  }

  const { data: afterJob, error: afterError } = await admin
    .from('automation_scheduled_jobs')
    .select('id,status,attempt_count,claimed_at,payload')
    .eq('organization_id', organizationId)
    .eq('id', job.id)
    .maybeSingle();

  if (afterError || !afterJob) go('error', afterError?.message || 'Unable to re-read the active-tenant job after the isolation probe.');

  const unchanged =
    afterJob.status === beforeStatus &&
    Number(afterJob.attempt_count ?? 0) === beforeAttempts &&
    afterJob.claimed_at === beforeClaimedAt;

  if (!unchanged) {
    go('error', 'Cross-tenant isolation failed closed: the foreign-tenant probe changed the active-tenant job state. Automatic runtime remains disabled.');
  }

  const mergedPayload = {
    ...((afterJob.payload ?? {}) as Record<string, unknown>),
    cross_tenant_isolation_test: {
      foreign_organization_name: foreignOrganization.name,
      claims_observed: 0,
      job_status_unchanged: true,
      attempt_count_unchanged: true,
      claimed_at_unchanged: true,
      automatic_runtime_enabled: false,
      customer_message_sent: false,
    },
  };

  const { error: evidenceError } = await admin
    .from('automation_scheduled_jobs')
    .update({ payload: mergedPayload })
    .eq('organization_id', organizationId)
    .eq('id', job.id)
    .eq('status', 'scheduled');

  if (evidenceError) go('error', evidenceError.message);

  revalidatePath('/automation/runtime-worker-test');
  go(
    'notice',
    `Cross-tenant isolation passed: ${foreignOrganization.name} worker scope could not claim this ${job.job_type} job. The job remains scheduled with attempts unchanged at ${beforeAttempts}; automatic runtime remains disabled and no customer message was sent.`,
  );
}
