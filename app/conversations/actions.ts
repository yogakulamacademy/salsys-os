'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

const DEFAULT_WHATSAPP_API_VERSION = 'v26.0';
const MAX_TEXT_LENGTH = 4096;
const CUSTOMER_SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

function textValue(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? '').trim();
  return value || null;
}

function requireEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is not configured.`);
  }

  return value;
}

function whatsappApiVersion() {
  const value =
    process.env.WA_API_VERSION?.trim() ||
    DEFAULT_WHATSAPP_API_VERSION;

  return /^v\d+\.\d+$/.test(value)
    ? value
    : DEFAULT_WHATSAPP_API_VERSION;
}

function normalizeWaId(value: string | null | undefined) {
  return String(value ?? '').replace(/\D/g, '');
}

function conversationUrl(
  leadId: string,
  params: Record<string, string>
) {
  const search = new URLSearchParams({
    lead: leadId,
    ...params,
  });

  return `/conversations?${search.toString()}`;
}

type MetaSendResponse = {
  messaging_product?: string;
  contacts?: Array<{
    input?: string;
    wa_id?: string;
  }>;
  messages?: Array<{
    id?: string;
    message_status?: string;
  }>;
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
};

export async function sendWhatsAppMessageAction(
  leadId: string,
  formData: FormData
) {
  const body = textValue(formData, 'body');

  if (!body) {
    redirect(
      conversationUrl(leadId, {
        error: 'Message text is required.',
      })
    );
  }

  if (body.length > MAX_TEXT_LENGTH) {
    redirect(
      conversationUrl(leadId, {
        error: `WhatsApp text messages are limited to ${MAX_TEXT_LENGTH} characters.`,
      })
    );
  }

  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect('/login');
  }

  const { data: contact, error: contactError } =
    await supabase
      .from('lead_contacts')
      .select('value, normalized_value, is_primary')
      .eq('lead_id', leadId)
      .eq('contact_type', 'whatsapp')
      .order('is_primary', { ascending: false })
      .limit(1)
      .maybeSingle();

  if (contactError) {
    redirect(
      conversationUrl(leadId, {
        error: `Unable to load WhatsApp contact: ${contactError.message}`,
      })
    );
  }

  const to = normalizeWaId(
    contact?.normalized_value || contact?.value
  );

  if (!to) {
    redirect(
      conversationUrl(leadId, {
        error: 'This lead does not have a WhatsApp contact.',
      })
    );
  }

  const { data: conversation, error: conversationError } =
    await supabase
      .from('conversations')
      .select(
        'id, external_conversation_id, external_account_id, last_message_at'
      )
      .eq('lead_id', leadId)
      .eq('channel', 'whatsapp')
      .order('last_message_at', {
        ascending: false,
        nullsFirst: false,
      })
      .limit(1)
      .maybeSingle();

  if (conversationError) {
    redirect(
      conversationUrl(leadId, {
        error: `Unable to load WhatsApp conversation: ${conversationError.message}`,
      })
    );
  }

  if (!conversation?.id) {
    redirect(
      conversationUrl(leadId, {
        error:
          'No WhatsApp conversation exists for this lead yet. Receive an inbound message first.',
      })
    );
  }

  // Free-form WhatsApp Cloud API text replies are only appropriate
  // inside the active customer-service conversation window.
  const { data: lastInbound, error: inboundError } =
    await supabase
      .from('messages')
      .select('created_at')
      .eq('conversation_id', conversation.id)
      .eq('direction', 'inbound')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

  if (inboundError) {
    redirect(
      conversationUrl(leadId, {
        error: `Unable to check the last inbound WhatsApp message: ${inboundError.message}`,
      })
    );
  }

  if (!lastInbound?.created_at) {
    redirect(
      conversationUrl(leadId, {
        error:
          'No inbound WhatsApp message was found. Use an approved WhatsApp template to start a conversation.',
      })
    );
  }

  const lastInboundAt = new Date(lastInbound.created_at).getTime();

  if (
    !Number.isFinite(lastInboundAt) ||
    Date.now() - lastInboundAt >
      CUSTOMER_SERVICE_WINDOW_MS
  ) {
    redirect(
      conversationUrl(leadId, {
        error:
          'The 24-hour WhatsApp customer-service window has expired. An approved template is required.',
      })
    );
  }

  const accessToken = requireEnv('WA_ACCESS_TOKEN');
  const phoneNumberId = requireEnv('WA_PHONE_NUMBER_ID');
  const version = whatsappApiVersion();

  const response = await fetch(
    `https://graph.facebook.com/${version}/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: {
          preview_url: false,
          body,
        },
      }),
      cache: 'no-store',
    }
  );

  const responseText = await response.text();

  let meta: MetaSendResponse = {};

  try {
    meta = responseText
      ? (JSON.parse(responseText) as MetaSendResponse)
      : {};
  } catch {
    meta = {};
  }

  if (!response.ok) {
    const metaMessage =
      meta.error?.message ||
      `Meta returned HTTP ${response.status}.`;

    redirect(
      conversationUrl(leadId, {
        error: `WhatsApp send failed: ${metaMessage}`,
      })
    );
  }

  const externalMessageId =
    meta.messages?.[0]?.id?.trim() || null;

  // Keep using the CRM's canonical interaction logger so timeline,
  // contact timestamps, stage assistance and conversation history
  // continue to behave the same way as manual CRM interactions.
  const { error: logError } = await supabase.rpc(
    'log_lead_interaction',
    {
      p_lead_id: leadId,
      p_channel: 'whatsapp',
      p_direction: 'outbound',
      p_body: body,
      p_conversation_id: conversation.id,
    }
  );

  if (logError) {
    // The WhatsApp API call already succeeded at this point.
    // Explicitly warn the operator not to resend and create a duplicate.
    redirect(
      conversationUrl(leadId, {
        error:
          `WhatsApp was sent, but CRM logging failed: ${logError.message}. Do not resend this message until the CRM record is checked.`,
      })
    );
  }

  revalidatePath('/conversations');
  revalidatePath(`/leads/${leadId}`);
  revalidatePath('/leads');
  revalidatePath('/dashboard');
  revalidatePath('/admissions');

  redirect(
    conversationUrl(leadId, {
      notice: 'whatsapp-sent',
      ...(externalMessageId
        ? { wamid: externalMessageId }
        : {}),
    })
  );
}
