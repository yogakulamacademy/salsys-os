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
  redirect(`/automation/flow-validation-test?${type}=${encodeURIComponent(message)}`);
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
    go('error', 'Only organization admins can validate conversation flows.');
  }

  return { organizationId };
}

export async function validateControlledFlowAction(formData: FormData) {
  const workflowId = value(formData, 'workflow_id');
  const versionNumber = Number(value(formData, 'version_number') || '1');

  if (!workflowId) go('error', 'Workflow is required.');
  if (!Number.isInteger(versionNumber) || versionNumber < 1) {
    go('error', 'Flow version is invalid.');
  }

  const { organizationId } = await adminContext();
  const admin = createAdminClient();

  const { data, error } = await admin.rpc('validate_automation_flow_version_v2', {
    p_organization_id: organizationId,
    p_workflow_id: workflowId,
    p_version_number: versionNumber,
    p_now: new Date().toISOString(),
  });

  if (error) go('error', error.message);

  const result = (data ?? {}) as Record<string, unknown>;
  const valid = result.valid === true;
  const nodeCount = Number(result.node_count ?? 0);
  const edgeCount = Number(result.edge_count ?? 0);
  const errors = Array.isArray(result.errors) ? result.errors : [];
  const warnings = Array.isArray(result.warnings) ? result.warnings : [];

  revalidatePath('/automation/flow-validation-test');
  revalidatePath('/automation/flow-builder');
  revalidatePath('/automation/flow-publish-test');

  if (valid) {
    const warningText = warnings.length > 0 ? ` ${warnings.length} warning${warnings.length === 1 ? '' : 's'} remain.` : '';
    go(
      'notice',
      `Draft validation passed: ${nodeCount} nodes and ${edgeCount} connections are structurally valid under guarded V2.${warningText} The definition is hash-locked for publish, but runtime execution and customer messaging remain disabled.`,
    );
  }

  go(
    'error',
    `Draft validation found ${errors.length} blocking issue${errors.length === 1 ? '' : 's'}. Nothing was published or executed.`,
  );
}
