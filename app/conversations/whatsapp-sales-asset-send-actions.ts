'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { executeHumanWhatsAppSalesAssetSend } from '@/lib/integrations/whatsapp-sales-asset-media';

const CUSTOMER_SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_CAPTION_LENGTH = 1024;

export type WhatsAppSalesAssetActionResult =
  | {
      ok: true;
      customerMessageSent: true;
      error: null;
      message: {
        id: string;
        body: string;
        direction: 'outbound';
        senderType: 'human';
        channel: 'whatsapp';
        status: 'sent';
        externalMessageId: string;
        createdAt: string;
        messageType: 'image' | 'document';
        salesAsset: {
          assetId: string;
          title: string;
          assetKind: 'image' | 'pdf' | 'document';
          version: number;
          mimeType: string;
        };
      };
    }
  | {
      ok: false;
      customerMessageSent: boolean;
      error: string;
      message:
        | {
            id: null;
            body: string;
            direction: 'outbound';
            senderType: 'human';
            channel: 'whatsapp';
            status: 'sent';
            externalMessageId: string;
            createdAt: string;
            messageType: 'image' | 'document';
            salesAsset: {
              assetId: string;
              title: string;
              assetKind: 'image' | 'pdf' | 'document';
              version: number;
              mimeType: string;
            };
          }
        | null;
    };

function textValue(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? '').trim();
  return value || null;
}

function normalizeWaId(value: string | null | undefined) {
  return String(value ?? '').replace(/\D/g, '');
}

function failure(error: string): WhatsAppSalesAssetActionResult {
  return {
    ok: false,
    customerMessageSent: false,
    error,
    message: null,
  };
}

export async function sendWhatsAppSalesAssetMessageAction(
  leadId: string,
  formData: FormData,
): Promise<WhatsAppSalesAssetActionResult> {
  const normalizedLeadId = leadId.trim();
  const assetId = textValue(formData, 'sales_asset_id');
  const caption = textValue(formData, 'body');

  if (!normalizedLeadId || !assetId) {
    return failure('Lead and Sales Asset are required.');
  }

  if (!caption) {
    return failure('A caption is required for this controlled media send.');
  }

  if (caption.length > MAX_CAPTION_LENGTH) {
    return failure(`WhatsApp media captions are limited to ${MAX_CAPTION_LENGTH} characters.`);
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return failure('Your session has expired. Sign in again before sending.');
  }

  const { data: canWorkLead, error: accessError } = await supabase.rpc(
    'can_work_lead',
    { p_lead_id: normalizedLeadId },
  );

  if (accessError || canWorkLead !== true) {
    return failure(accessError?.message || 'You do not have access to this lead.');
  }

  const admin = createAdminClient();
  const { data: lead, error: leadError } = await admin
    .from('leads')
    .select(
      'id,organization_id,interested_course_id,preferred_location,language,current_contact_channel',
    )
    .eq('id', normalizedLeadId)
    .maybeSingle();

  if (leadError || !lead?.organization_id) {
    return failure(leadError?.message || 'Unable to load this lead.');
  }

  if (lead.current_contact_channel !== 'whatsapp') {
    return failure('This controlled Sales Asset send is available only for the active WhatsApp conversation.');
  }

  const organizationId = String(lead.organization_id);

  const { data: contact, error: contactError } = await admin
    .from('lead_contacts')
    .select('value,normalized_value,is_primary')
    .eq('lead_id', normalizedLeadId)
    .eq('organization_id', organizationId)
    .eq('contact_type', 'whatsapp')
    .order('is_primary', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (contactError) {
    return failure(`Unable to load WhatsApp contact: ${contactError.message}`);
  }

  const recipient = normalizeWaId(contact?.normalized_value || contact?.value);
  if (!recipient) {
    return failure('This lead does not have a WhatsApp contact.');
  }

  const { data: conversation, error: conversationError } = await admin
    .from('conversations')
    .select('id,last_message_at')
    .eq('lead_id', normalizedLeadId)
    .eq('organization_id', organizationId)
    .eq('channel', 'whatsapp')
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (conversationError || !conversation?.id) {
    return failure(
      conversationError?.message ||
        'No WhatsApp conversation exists for this lead yet. Receive an inbound message first.',
    );
  }

  const { data: lastInbound, error: inboundError } = await admin
    .from('messages')
    .select('created_at')
    .eq('organization_id', organizationId)
    .eq('conversation_id', conversation.id)
    .eq('direction', 'inbound')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (inboundError) {
    return failure(`Unable to check the WhatsApp customer-service window: ${inboundError.message}`);
  }

  if (!lastInbound?.created_at) {
    return failure('No inbound WhatsApp message was found. Use an approved template to start a conversation.');
  }

  const lastInboundAt = new Date(lastInbound.created_at).getTime();
  if (
    !Number.isFinite(lastInboundAt) ||
    Date.now() - lastInboundAt > CUSTOMER_SERVICE_WINDOW_MS
  ) {
    return failure('The 24-hour WhatsApp customer-service window has expired. An approved template is required.');
  }

  let courseScope: string | null = null;
  if (lead.interested_course_id) {
    const { data: course, error: courseError } = await admin
      .from('courses')
      .select('code,name')
      .eq('organization_id', organizationId)
      .eq('id', lead.interested_course_id)
      .maybeSingle();

    if (courseError) {
      return failure('Current course scope is unavailable. Retry before sending this attachment.');
    }

    courseScope = String(course?.code || '').trim() || String(course?.name || '').trim() || null;
  }

  try {
    const result = await executeHumanWhatsAppSalesAssetSend({
      organizationId,
      leadId: normalizedLeadId,
      conversationId: String(conversation.id),
      actorId: user.id,
      recipient,
      assetId,
      caption,
      course: courseScope,
      location: String(lead.preferred_location || '').trim() || null,
      language: String(lead.language || '').trim() || null,
    });

    const messageType = result.asset?.assetKind === 'image' ? 'image' : 'document';

    if (
      result.ok &&
      result.customerMessageSent &&
      result.canonicalMessageId &&
      result.providerMessageId &&
      result.asset
    ) {
      return {
        ok: true,
        customerMessageSent: true,
        error: null,
        message: {
          id: result.canonicalMessageId,
          body: caption,
          direction: 'outbound',
          senderType: 'human',
          channel: 'whatsapp',
          status: 'sent',
          externalMessageId: result.providerMessageId,
          createdAt: result.canonicalCreatedAt || new Date().toISOString(),
          messageType,
          salesAsset: result.asset,
        },
      };
    }

    if (result.customerMessageSent && result.providerMessageId && result.asset) {
      return {
        ok: false,
        customerMessageSent: true,
        error:
          result.error ||
          'WhatsApp accepted the attachment, but CRM reconciliation is incomplete. Do not resend it.',
        message: {
          id: null,
          body: caption,
          direction: 'outbound',
          senderType: 'human',
          channel: 'whatsapp',
          status: 'sent',
          externalMessageId: result.providerMessageId,
          createdAt: result.canonicalCreatedAt || new Date().toISOString(),
          messageType,
          salesAsset: result.asset,
        },
      };
    }

    return failure(result.error || 'WhatsApp Sales Asset send failed before customer delivery.');
  } catch (error) {
    return failure(error instanceof Error ? error.message : 'WhatsApp Sales Asset send failed.');
  }
}
