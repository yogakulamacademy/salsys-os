'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { requireCurrentOrganizationId } from '@/lib/workspace';

type JsonRecord = Record<string, unknown>;

function textValue(formData: FormData, key: string) {
  return String(formData.get(key) ?? '').trim();
}

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function go(workflowId: string, type: 'notice' | 'error', message: string): never {
  const query = new URLSearchParams();
  if (workflowId) query.set('workflow', workflowId);
  query.set(type, message);
  redirect(`/automation/flow-builder?${query.toString()}`);
}

async function managementContext(workflowId: string) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    go(workflowId, 'error', 'Your session has expired. Sign in again.');
  }

  const organizationId = await requireCurrentOrganizationId(supabase, user.id);
  const { data: canManage, error: manageError } = await supabase.rpc('can_manage_organization', {
    p_organization_id: organizationId,
  });

  if (manageError || canManage !== true) {
    go(workflowId, 'error', 'Only organization admins can validate or publish automation flows.');
  }

  return { admin: createAdminClient(), user, organizationId };
}

function parseVersion(formData: FormData, workflowId: string) {
  const versionNumber = Number(textValue(formData, 'version_number') || '0');
  if (!Number.isInteger(versionNumber) || versionNumber < 1) {
    go(workflowId, 'error', 'A valid draft flow version is required.');
  }
  return versionNumber;
}

async function assertSmartTriggerRuntimeSupport(
  admin: ReturnType<typeof createAdminClient>,
  organizationId: string,
  workflowId: string,
) {
  const { data: workflow, error } = await admin
    .from('automation_workflows')
    .select('metadata')
    .eq('organization_id', organizationId)
    .eq('id', workflowId)
    .maybeSingle();

  if (error) go(workflowId, 'error', `Unable to check Smart Trigger readiness: ${error.message}`);
  const metadata = record(workflow?.metadata);
  if (metadata.smart_trigger_condition_runtime_pending === true) {
    go(
      workflowId,
      'error',
      'This Smart Trigger draft contains AND/OR condition groups that are saved for review but are not yet supported by the runtime evaluator. Keep it in draft until condition-runtime support is enabled.',
    );
  }
}

export async function validateAutomationFlowAction(formData: FormData) {
  const workflowId = textValue(formData, 'workflow_id');
  if (!workflowId) go('', 'error', 'Workflow is required.');

  const versionNumber = parseVersion(formData, workflowId);
  const { admin, organizationId } = await managementContext(workflowId);
  await assertSmartTriggerRuntimeSupport(admin, organizationId, workflowId);

  const { data, error } = await admin.rpc('validate_automation_flow_version_v2', {
    p_organization_id: organizationId,
    p_workflow_id: workflowId,
    p_version_number: versionNumber,
  });

  if (error) go(workflowId, 'error', `Flow validation failed: ${error.message}`);

  const result = record(data);
  const valid = result.valid === true;
  const errors = Array.isArray(result.errors) ? result.errors.map(String) : [];
  const warnings = Array.isArray(result.warnings) ? result.warnings.map(String) : [];

  revalidatePath('/automation/flow-builder');
  revalidatePath('/automation/readiness');

  if (!valid) {
    go(
      workflowId,
      'error',
      errors.length > 0
        ? `Draft Version ${versionNumber} is not publishable: ${errors.slice(0, 3).join(' · ')}`
        : `Draft Version ${versionNumber} is not publishable. Review the validation panel.`,
    );
  }

  go(
    workflowId,
    'notice',
    warnings.length > 0
      ? `Draft Version ${versionNumber} validated with ${warnings.length} warning${warnings.length === 1 ? '' : 's'}. It is eligible to publish.`
      : `Draft Version ${versionNumber} validated successfully and is eligible to publish.`,
  );
}

export async function publishAutomationFlowAction(formData: FormData) {
  const workflowId = textValue(formData, 'workflow_id');
  if (!workflowId) go('', 'error', 'Workflow is required.');

  const versionNumber = parseVersion(formData, workflowId);
  const { admin, user, organizationId } = await managementContext(workflowId);
  await assertSmartTriggerRuntimeSupport(admin, organizationId, workflowId);

  const { data: version, error: versionError } = await admin
    .from('automation_flow_versions')
    .select('status,definition_hash,validated_at,validation_snapshot')
    .eq('organization_id', organizationId)
    .eq('workflow_id', workflowId)
    .eq('version_number', versionNumber)
    .maybeSingle();

  if (versionError || !version) {
    go(workflowId, 'error', versionError?.message || 'Draft flow version was not found.');
  }

  const validation = record(version.validation_snapshot);
  if (
    version.status !== 'draft' ||
    !version.validated_at ||
    validation.valid !== true ||
    !version.definition_hash
  ) {
    go(workflowId, 'error', 'Validate the current draft successfully before publishing.');
  }

  const { data, error } = await admin.rpc('publish_and_clone_automation_flow_version_v1', {
    p_organization_id: organizationId,
    p_workflow_id: workflowId,
    p_version_number: versionNumber,
    p_definition_hash: version.definition_hash,
    p_actor_user_id: user.id,
  });

  if (error) go(workflowId, 'error', `Flow publish failed: ${error.message}`);

  const result = record(data);
  const publishedVersion = Number(result.published_version ?? versionNumber);
  const nextDraftVersion = Number(result.next_draft_version ?? versionNumber + 1);

  revalidatePath('/automation');
  revalidatePath('/automation/flow-builder');
  revalidatePath('/automation/readiness');
  revalidatePath('/automation/settings');

  go(
    workflowId,
    'notice',
    `Published Version ${publishedVersion}. Draft Version ${nextDraftVersion} was cloned for future edits, and runtime execution remains OFF until explicitly enabled.`,
  );
}