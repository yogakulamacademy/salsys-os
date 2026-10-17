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
    return jsonResponse({ ok: false, error: 'Sign in to review automation approvals.', customerMessageSent: false }, 401);
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
      { ok: false, error: 'You do not have permission to review automation sends for this workspace.', customerMessageSent: false },
      403,
    );
  }

  const { approvalId } = await context.params;
  const normalizedApprovalId = stringValue(approvalId);
  if (!normalizedApprovalId) {
    return jsonResponse({ ok: false, error: 'Approval request ID is required.', customerMessageSent: false }, 400);
  }

  let body: JsonRecord = {};
  try {
    body = record(await request.json());
  } catch {
    body = {};
  }

  const decision = stringValue(body.decision)?.toLowerCase();
  const reason = stringValue(body.reason);
  if (decision !== 'approve' && decision !== 'reject') {
    return jsonResponse({ ok: false, error: 'decision must be approve or reject.', customerMessageSent: false }, 400);
  }

  const { data: decisionData, error: decisionError } = await supabase.rpc('decide_automation_approval_v1', {
    p_organization_id: activeWorkspace.organizationId,
    p_approval_request_id: normalizedApprovalId,
    p_decision: decision,
    p_reason: reason,
    p_decided_by: user.id,
  });

  if (decisionError) {
    return jsonResponse(
      { ok: false, error: `Unable to save approval decision: ${decisionError.message}`, customerMessageSent: false },
      500,
    );
  }

  const decisionResult = record(decisionData);
  if (decisionResult.ok !== true) {
    return jsonResponse(
      {
        ok: false,
        error: stringValue(decisionResult.reason) || 'Approval decision was not accepted.',
        approval: decisionResult,
        customerMessageSent: false,
      },
      409,
    );
  }

  if (decision === 'reject') {
    return jsonResponse(
      {
        ok: true,
        approval: decisionResult,
        execution: { status: 'rejected', providerCallAttempted: false },
        customerMessageSent: false,
      },
      200,
    );
  }

  const admin = createAdminClient();
  const { data: prepareData, error: prepareError } = await admin.rpc('prepare_approved_whatsapp_provider_send_v1', {
    p_organization_id: activeWorkspace.organizationId,
    p_approval_request_id: normalizedApprovalId,
  });

  if (prepareError) {
    return jsonResponse(
      {
        ok: false,
        error: `Approval was saved, but provider preparation failed: ${prepareError.message}`,
        approval: decisionResult,
        customerMessageSent: false,
      },
      500,
    );
  }

  const preparation = record(prepareData);
  const auditId = stringValue(preparation.audit_id);
  const providerCallAllowed = preparation.provider_call_allowed === true;

  // Human approval alone never overrides the provider kill switch or any channel
  // safety rule. A blocked preparation remains paused for operator review.
  if (!providerCallAllowed || !auditId) {
    return jsonResponse(
      {
        ok: true,
        approval: decisionResult,
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
        approval: decisionResult,
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
        approval: decisionResult,
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
        approval: decisionResult,
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
      approval: decisionResult,
      preparation,
      execution,
      completion,
      customerMessageSent: true,
    },
    200,
  );
}
