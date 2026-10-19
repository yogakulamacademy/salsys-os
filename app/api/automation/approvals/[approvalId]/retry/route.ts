import { NextRequest, NextResponse } from 'next/server';

import { executePreparedWhatsAppProviderSend } from '@/lib/integrations/whatsapp-provider-send';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getWorkspaceContextForUser } from '@/lib/workspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type JsonRecord = Record<string, unknown>;

function jsonResponse(body: JsonRecord, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function sameOrigin(request: NextRequest) {
  return request.headers.get('origin') === request.nextUrl.origin;
}

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ approvalId: string }> },
) {
  if (!sameOrigin(request)) {
    return jsonResponse({ ok: false, error: 'Invalid request origin.', customerMessageSent: false }, 403);
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return jsonResponse({ ok: false, error: 'Sign in to retry automation sends.', customerMessageSent: false }, 401);
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id,active')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError || !profile || profile.active !== true) {
    return jsonResponse({ ok: false, error: 'Your CRM account is not active.', customerMessageSent: false }, 403);
  }

  const workspaceContext = await getWorkspaceContextForUser(supabase, user.id);
  const activeWorkspace = workspaceContext.activeWorkspace;

  if (!activeWorkspace || !['owner', 'admin', 'admissions'].includes(activeWorkspace.role)) {
    return jsonResponse(
      { ok: false, error: 'You do not have permission to retry automation sends for this workspace.', customerMessageSent: false },
      403,
    );
  }

  const { approvalId } = await context.params;
  const normalizedApprovalId = stringValue(approvalId);
  if (!normalizedApprovalId) {
    return jsonResponse({ ok: false, error: 'Approval request ID is required.', customerMessageSent: false }, 400);
  }

  const { data: approval, error: approvalError } = await supabase
    .from('automation_approval_requests')
    .select('id,status,provider_send_audit_id')
    .eq('organization_id', activeWorkspace.organizationId)
    .eq('id', normalizedApprovalId)
    .maybeSingle();

  if (approvalError) {
    return jsonResponse({ ok: false, error: `Unable to load approval: ${approvalError.message}`, customerMessageSent: false }, 500);
  }

  if (!approval || approval.status !== 'approved') {
    return jsonResponse({ ok: false, error: 'Only an approved automation send can be retried.', customerMessageSent: false }, 409);
  }

  const failedAuditId = stringValue(approval.provider_send_audit_id);
  if (!failedAuditId) {
    return jsonResponse({ ok: false, error: 'This approval does not have a provider-send audit to retry.', customerMessageSent: false }, 409);
  }

  const admin = createAdminClient();
  const { data: retryData, error: retryError } = await admin.rpc('prepare_failed_whatsapp_provider_retry_v1', {
    p_organization_id: activeWorkspace.organizationId,
    p_failed_audit_id: failedAuditId,
  });

  if (retryError) {
    return jsonResponse({ ok: false, error: `Unable to prepare provider retry: ${retryError.message}`, customerMessageSent: false }, 500);
  }

  const preparation = record(retryData);
  const auditId = stringValue(preparation.audit_id);
  const providerCallAllowed = preparation.provider_call_allowed === true;

  if (!providerCallAllowed || !auditId) {
    return jsonResponse(
      {
        ok: true,
        preparation,
        execution: { status: stringValue(preparation.status) || 'blocked', providerCallAttempted: false },
        customerMessageSent: false,
      },
      202,
    );
  }

  const execution = await executePreparedWhatsAppProviderSend({
    organizationId: activeWorkspace.organizationId,
    auditId,
  });

  if (!execution.ok || execution.customerMessageSent !== true || execution.status !== 'sent') {
    return jsonResponse(
      {
        ok: false,
        preparation,
        execution,
        customerMessageSent: execution.customerMessageSent,
      },
      execution.providerCallAttempted ? 502 : 409,
    );
  }

  const { data: completionData, error: completionError } = await admin.rpc('complete_whatsapp_send_approval_v1', {
    p_organization_id: activeWorkspace.organizationId,
    p_approval_request_id: normalizedApprovalId,
    p_provider_send_audit_id: auditId,
  });

  if (completionError) {
    return jsonResponse(
      {
        ok: false,
        error: `WhatsApp was accepted by the provider, but workflow continuation needs operator review: ${completionError.message}`,
        preparation,
        execution,
        customerMessageSent: true,
      },
      500,
    );
  }

  const completion = record(completionData);
  if (completion.ok !== true || completion.completed !== true) {
    return jsonResponse(
      {
        ok: false,
        error: stringValue(completion.reason) || 'WhatsApp was sent, but the workflow could not safely continue.',
        preparation,
        execution,
        completion,
        customerMessageSent: true,
      },
      409,
    );
  }

  return jsonResponse(
    {
      ok: true,
      preparation,
      execution,
      completion,
      customerMessageSent: true,
    },
    200,
  );
}
