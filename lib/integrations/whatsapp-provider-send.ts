import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { getWhatsAppRuntimeForOrganization } from '@/lib/integrations/whatsapp-connection';

const DEFAULT_WHATSAPP_API_VERSION = 'v26.0';

type JsonRecord = Record<string, unknown>;

type ClaimResult = {
  ok?: boolean;
  claimed?: boolean;
  audit_id?: string;
  status?: string;
  provider_call_allowed?: boolean;
  customer_message_sent?: boolean;
  reason?: string;
  lead_id?: string;
  whatsapp_account_id?: string | null;
  whatsapp_template_id?: string | null;
  request_payload?: JsonRecord;
};

type FinalizeResult = {
  ok?: boolean;
  finalized?: boolean;
  status?: string;
  provider_message_id?: string | null;
  customer_message_sent?: boolean;
  reason?: string;
};

type RecordSuccessResult = {
  ok?: boolean;
  recorded?: boolean;
  status?: string;
  message_id?: string | null;
  conversation_id?: string | null;
  provider_message_id?: string | null;
  customer_message_sent?: boolean;
  reason?: string;
};

type MetaSendResponse = {
  messaging_product?: string;
  contacts?: Array<{ input?: string; wa_id?: string }>;
  messages?: Array<{ id?: string; message_status?: string }>;
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
};

export type WhatsAppProviderSendResult = {
  ok: boolean;
  auditId: string;
  status: string;
  providerCallAttempted: boolean;
  providerMessageId: string | null;
  canonicalMessageId: string | null;
  customerMessageSent: boolean;
  error: string | null;
};

function apiVersion() {
  const value = process.env.WA_API_VERSION?.trim() || DEFAULT_WHATSAPP_API_VERSION;
  return /^v\d+\.\d+$/.test(value) ? value : DEFAULT_WHATSAPP_API_VERSION;
}

function normalizeRecipient(value: string) {
  const digits = value.replace(/[^0-9]/g, '');
  if (digits.length < 8 || digits.length > 15) {
    throw new Error('The lead does not have a valid WhatsApp recipient number.');
  }
  return digits;
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function sanitizeMetaResponse(payload: MetaSendResponse, status: number) {
  return {
    http_status: status,
    messaging_product: optionalString(payload.messaging_product),
    provider_message_id: optionalString(payload.messages?.[0]?.id),
    provider_message_status: optionalString(payload.messages?.[0]?.message_status),
    error: payload.error
      ? {
          message: optionalString(payload.error.message),
          type: optionalString(payload.error.type),
          code: typeof payload.error.code === 'number' ? payload.error.code : null,
          error_subcode:
            typeof payload.error.error_subcode === 'number'
              ? payload.error.error_subcode
              : null,
        }
      : null,
  };
}

async function finalize(params: {
  organizationId: string;
  auditId: string;
  success: boolean;
  providerMessageId?: string | null;
  providerResponse?: JsonRecord;
  providerError?: string | null;
}) {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('finalize_whatsapp_provider_send_v1', {
    p_organization_id: params.organizationId,
    p_audit_id: params.auditId,
    p_success: params.success,
    p_provider_message_id: params.providerMessageId ?? null,
    p_provider_response: params.providerResponse ?? {},
    p_provider_error: params.providerError ?? null,
  });

  if (error) {
    throw new Error(`Unable to finalize WhatsApp provider-send audit: ${error.message}`);
  }

  return asRecord(data) as FinalizeResult;
}

async function recordSuccessfulSend(params: {
  organizationId: string;
  auditId: string;
  providerMessageId: string;
  providerResponse: JsonRecord;
}) {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('record_whatsapp_provider_send_success_v1', {
    p_organization_id: params.organizationId,
    p_audit_id: params.auditId,
    p_provider_message_id: params.providerMessageId,
    p_provider_response: params.providerResponse,
  });

  if (error) {
    throw new Error(`Unable to link WhatsApp provider send to canonical CRM message: ${error.message}`);
  }

  const result = asRecord(data) as RecordSuccessResult;
  if (result.ok !== true || result.recorded !== true) {
    throw new Error(
      optionalString(result.reason) || 'WhatsApp provider send could not be linked to the canonical CRM message.',
    );
  }

  return result;
}

async function preserveProviderAcceptance(params: {
  organizationId: string;
  auditId: string;
  providerMessageId: string;
  providerResponse: JsonRecord;
  reconciliationError: string;
}) {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const fallbackResponse = {
    ...params.providerResponse,
    canonical_reconciliation: {
      status: 'required',
      error: params.reconciliationError.slice(0, 2000),
      recorded_at: now,
    },
  };

  const { error } = await admin
    .from('automation_provider_send_audits')
    .update({
      status: 'sent',
      provider_message_id: params.providerMessageId,
      provider_response: fallbackResponse,
      provider_error: null,
      customer_message_sent: true,
      sent_at: now,
      provider_delivery_status: 'sent',
      updated_at: now,
    })
    .eq('organization_id', params.organizationId)
    .eq('id', params.auditId)
    .eq('channel', 'whatsapp')
    .eq('provider', 'meta_cloud_api')
    .eq('status', 'sending');

  if (error) {
    throw new Error(
      `Meta accepted the WhatsApp message, but the provider audit reconciliation fallback also failed: ${error.message}`,
    );
  }
}

async function resolveRecipient(organizationId: string, leadId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('lead_contacts')
    .select('id,contact_type,value,normalized_value,is_primary,verified,created_at')
    .eq('organization_id', organizationId)
    .eq('lead_id', leadId)
    .in('contact_type', ['whatsapp', 'phone']);

  if (error) {
    throw new Error(`Unable to resolve WhatsApp recipient: ${error.message}`);
  }

  const rows = data ?? [];
  const selected = [...rows].sort((left, right) => {
    const leftWhatsApp = left.contact_type === 'whatsapp' ? 1 : 0;
    const rightWhatsApp = right.contact_type === 'whatsapp' ? 1 : 0;
    if (leftWhatsApp !== rightWhatsApp) return rightWhatsApp - leftWhatsApp;

    const leftPrimary = left.is_primary ? 1 : 0;
    const rightPrimary = right.is_primary ? 1 : 0;
    if (leftPrimary !== rightPrimary) return rightPrimary - leftPrimary;

    const leftVerified = left.verified ? 1 : 0;
    const rightVerified = right.verified ? 1 : 0;
    if (leftVerified !== rightVerified) return rightVerified - leftVerified;

    return String(right.created_at ?? '').localeCompare(String(left.created_at ?? ''));
  })[0];

  const candidate = optionalString(selected?.normalized_value) || optionalString(selected?.value);
  if (!candidate) {
    throw new Error('The lead does not have a WhatsApp or phone contact value.');
  }

  return normalizeRecipient(candidate);
}

async function buildProviderPayload(params: {
  organizationId: string;
  accountId: string;
  recipient: string;
  requestPayload: JsonRecord;
  templateId: string | null;
}) {
  const requestedType = optionalString(params.requestPayload.message_type)?.toLowerCase();

  if (requestedType === 'text') {
    const body = optionalString(params.requestPayload.body) || optionalString(params.requestPayload.text);
    if (!body) {
      throw new Error('A WhatsApp text send requires request_payload.body or request_payload.text.');
    }

    return {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: params.recipient,
      type: 'text',
      text: {
        preview_url: params.requestPayload.preview_url === true,
        body,
      },
    };
  }

  if (requestedType === 'template' || params.templateId) {
    if (!params.templateId) {
      throw new Error('A WhatsApp template send requires an approved synchronized template.');
    }

    const admin = createAdminClient();
    const { data: template, error } = await admin
      .from('automation_whatsapp_templates')
      .select('id,organization_id,whatsapp_account_id,template_name,language_code,approval_status,active')
      .eq('id', params.templateId)
      .eq('organization_id', params.organizationId)
      .eq('whatsapp_account_id', params.accountId)
      .eq('approval_status', 'approved')
      .eq('active', true)
      .maybeSingle();

    if (error || !template) {
      throw new Error(error?.message || 'The synchronized WhatsApp template is not approved and active.');
    }

    const dynamic = asRecord(params.requestPayload.template);
    const components = Array.isArray(dynamic.components) ? dynamic.components : undefined;

    return {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: params.recipient,
      type: 'template',
      template: {
        name: String(template.template_name),
        language: { code: String(template.language_code) },
        ...(components ? { components } : {}),
      },
    };
  }

  throw new Error('Unsupported WhatsApp provider request payload. Expected message_type text or template.');
}

export async function executePreparedWhatsAppProviderSend(params: {
  organizationId: string;
  auditId: string;
}): Promise<WhatsAppProviderSendResult> {
  const organizationId = params.organizationId?.trim();
  const auditId = params.auditId?.trim();

  if (!organizationId || !auditId) {
    throw new Error('organizationId and auditId are required.');
  }

  const admin = createAdminClient();
  const { data: claimData, error: claimError } = await admin.rpc(
    'claim_whatsapp_provider_send_v2',
    {
      p_organization_id: organizationId,
      p_audit_id: auditId,
    },
  );

  if (claimError) {
    throw new Error(`Unable to claim WhatsApp provider send: ${claimError.message}`);
  }

  const claim = asRecord(claimData) as ClaimResult;

  if (claim.claimed !== true || claim.provider_call_allowed !== true) {
    return {
      ok: claim.ok === true,
      auditId,
      status: optionalString(claim.status) || 'blocked',
      providerCallAttempted: false,
      providerMessageId: null,
      canonicalMessageId: null,
      customerMessageSent: claim.customer_message_sent === true,
      error: optionalString(claim.reason),
    };
  }

  const leadId = optionalString(claim.lead_id);
  if (!leadId) {
    const reason = 'Provider-send claim did not include a lead_id.';
    await finalize({ organizationId, auditId, success: false, providerError: reason });
    return {
      ok: false,
      auditId,
      status: 'failed',
      providerCallAttempted: false,
      providerMessageId: null,
      canonicalMessageId: null,
      customerMessageSent: false,
      error: reason,
    };
  }

  let providerAccepted = false;
  let acceptedProviderMessageId: string | null = null;
  let acceptedProviderResponse: JsonRecord | null = null;

  try {
    const runtime = await getWhatsAppRuntimeForOrganization(organizationId);

    const { data: account, error: accountError } = await admin
      .from('whatsapp_accounts')
      .select('id,organization_id,phone_number_id,active,is_default')
      .eq('organization_id', organizationId)
      .eq('phone_number_id', runtime.phoneNumberId)
      .eq('active', true)
      .eq('is_default', true)
      .maybeSingle();

    if (accountError || !account?.id) {
      throw new Error(accountError?.message || 'Default WhatsApp provider account could not be resolved.');
    }

    const claimedAccountId = optionalString(claim.whatsapp_account_id);
    if (claimedAccountId && claimedAccountId !== String(account.id)) {
      throw new Error('The provider-send audit is bound to a different WhatsApp account.');
    }

    const recipient = await resolveRecipient(organizationId, leadId);
    const providerPayload = await buildProviderPayload({
      organizationId,
      accountId: String(account.id),
      recipient,
      requestPayload: asRecord(claim.request_payload),
      templateId: optionalString(claim.whatsapp_template_id),
    });

    const response = await fetch(
      `https://graph.facebook.com/${apiVersion()}/${encodeURIComponent(runtime.phoneNumberId)}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${runtime.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(providerPayload),
        cache: 'no-store',
      },
    );

    const responseText = await response.text();
    let payload: MetaSendResponse = {};
    try {
      payload = responseText ? JSON.parse(responseText) : {};
    } catch {
      payload = {};
    }

    const sanitizedResponse = sanitizeMetaResponse(payload, response.status);
    const providerMessageId = optionalString(payload.messages?.[0]?.id);

    if (!response.ok || !providerMessageId) {
      const providerError =
        optionalString(payload.error?.message) ||
        `Meta WhatsApp send returned HTTP ${response.status}.`;

      await finalize({
        organizationId,
        auditId,
        success: false,
        providerResponse: sanitizedResponse,
        providerError,
      });

      return {
        ok: false,
        auditId,
        status: 'failed',
        providerCallAttempted: true,
        providerMessageId: null,
        canonicalMessageId: null,
        customerMessageSent: false,
        error: providerError,
      };
    }

    providerAccepted = true;
    acceptedProviderMessageId = providerMessageId;
    acceptedProviderResponse = sanitizedResponse;

    const recorded = await recordSuccessfulSend({
      organizationId,
      auditId,
      providerMessageId,
      providerResponse: sanitizedResponse,
    });

    return {
      ok: recorded.ok === true,
      auditId,
      status: optionalString(recorded.status) || 'sent',
      providerCallAttempted: true,
      providerMessageId,
      canonicalMessageId: optionalString(recorded.message_id),
      customerMessageSent: recorded.customer_message_sent === true,
      error: optionalString(recorded.reason),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'WhatsApp provider send failed.';

    if (providerAccepted && acceptedProviderMessageId && acceptedProviderResponse) {
      try {
        await preserveProviderAcceptance({
          organizationId,
          auditId,
          providerMessageId: acceptedProviderMessageId,
          providerResponse: acceptedProviderResponse,
          reconciliationError: message,
        });
      } catch (fallbackError) {
        const fallbackMessage =
          fallbackError instanceof Error ? fallbackError.message : 'Provider acceptance fallback failed.';
        return {
          ok: false,
          auditId,
          status: 'sent',
          providerCallAttempted: true,
          providerMessageId: acceptedProviderMessageId,
          canonicalMessageId: null,
          customerMessageSent: true,
          error: `${message} ${fallbackMessage}`,
        };
      }

      return {
        ok: false,
        auditId,
        status: 'sent',
        providerCallAttempted: true,
        providerMessageId: acceptedProviderMessageId,
        canonicalMessageId: null,
        customerMessageSent: true,
        error: `Meta accepted the message, but canonical CRM reconciliation is required: ${message}`,
      };
    }

    try {
      await finalize({
        organizationId,
        auditId,
        success: false,
        providerError: message,
      });
    } catch {
      // Preserve the original provider/runtime error. The audit remains in sending
      // state for explicit operator investigation if finalization itself fails.
    }

    return {
      ok: false,
      auditId,
      status: 'failed',
      providerCallAttempted: false,
      providerMessageId: null,
      canonicalMessageId: null,
      customerMessageSent: false,
      error: message,
    };
  }
}
