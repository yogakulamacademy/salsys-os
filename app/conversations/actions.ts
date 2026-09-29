'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { useMockData } from '@/lib/config';
import {
  getApprovedWhatsAppTemplates,
  renderTemplateText,
} from '@/lib/whatsapp-templates';

const DEFAULT_WHATSAPP_API_VERSION = 'v26.0';
const MAX_TEXT_LENGTH = 4096;
const CUSTOMER_SERVICE_WINDOW_MS =
  24 * 60 * 60 * 1000;

function textValue(
  formData: FormData,
  key: string
) {
  const value = String(
    formData.get(key) ?? ''
  ).trim();

  return value || null;
}

function requireEnv(name: string) {
  const value =
    process.env[name]?.trim();

  if (!value) {
    throw new Error(
      `${name} is not configured.`
    );
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

function normalizeWaId(
  value: string | null | undefined
) {
  return String(value ?? '').replace(
    /\D/g,
    ''
  );
}

function conversationUrl(
  leadId: string,
  params: Record<string, string>
) {
  const search =
    new URLSearchParams({
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

/* =========================================================
   QUICK LEAD CONTEXT UPDATE

   Used directly from Conversations to update:
   - Interested course
   - Country
========================================================= */

export async function updateConversationLeadContextAction(
  leadId: string,
  formData: FormData
) {
  if (useMockData) {
    redirect(
      conversationUrl(leadId, {
        notice: 'lead-context-updated',
      })
    );
  }

  const courseId =
    textValue(
      formData,
      'course_id'
    );

  const country =
    textValue(
      formData,
      'country'
    );

  const supabase =
    await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect('/login');
  }

  const { error } =
    await supabase
      .from('leads')
      .update({
        interested_course_id:
          courseId,
        country,
      })
      .eq('id', leadId);

  if (error) {
    redirect(
      conversationUrl(leadId, {
        error:
          `Unable to update lead details: ${error.message}`,
      })
    );
  }

  revalidatePath('/conversations');
  revalidatePath(
    `/leads/${leadId}`
  );
  revalidatePath('/leads');
  revalidatePath('/dashboard');
  revalidatePath('/pipeline');
  revalidatePath('/funnel');
  revalidatePath('/revenue');

  redirect(
    conversationUrl(leadId, {
      notice: 'lead-context-updated',
    })
  );
}

/* =========================================================
   WHATSAPP SEND
========================================================= */

export async function sendWhatsAppMessageAction(
  leadId: string,
  formData: FormData
) {
  const body =
    textValue(
      formData,
      'body'
    );

  if (!body) {
    redirect(
      conversationUrl(leadId, {
        error:
          'Message text is required.',
      })
    );
  }

  if (
    body.length >
    MAX_TEXT_LENGTH
  ) {
    redirect(
      conversationUrl(leadId, {
        error:
          `WhatsApp text messages are limited to ${MAX_TEXT_LENGTH} characters.`,
      })
    );
  }

  const supabase =
    await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect('/login');
  }

  const {
    data: contact,
    error: contactError,
  } =
    await supabase
      .from('lead_contacts')
      .select(
        'value, normalized_value, is_primary'
      )
      .eq('lead_id', leadId)
      .eq(
        'contact_type',
        'whatsapp'
      )
      .order('is_primary', {
        ascending: false,
      })
      .limit(1)
      .maybeSingle();

  if (contactError) {
    redirect(
      conversationUrl(leadId, {
        error:
          `Unable to load WhatsApp contact: ${contactError.message}`,
      })
    );
  }

  const to =
    normalizeWaId(
      contact?.normalized_value ||
        contact?.value
    );

  if (!to) {
    redirect(
      conversationUrl(leadId, {
        error:
          'This lead does not have a WhatsApp contact.',
      })
    );
  }

  const {
    data: conversation,
    error: conversationError,
  } =
    await supabase
      .from('conversations')
      .select(
        `
        id,
        external_conversation_id,
        external_account_id,
        last_message_at
        `
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
        error:
          `Unable to load WhatsApp conversation: ${conversationError.message}`,
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

  /*
   * Free-form WhatsApp messages are
   * allowed only inside the active
   * customer-service window.
   */

  const {
    data: lastInbound,
    error: inboundError,
  } =
    await supabase
      .from('messages')
      .select('created_at')
      .eq(
        'conversation_id',
        conversation.id
      )
      .eq(
        'direction',
        'inbound'
      )
      .order('created_at', {
        ascending: false,
      })
      .limit(1)
      .maybeSingle();

  if (inboundError) {
    redirect(
      conversationUrl(leadId, {
        error:
          `Unable to check the last inbound WhatsApp message: ${inboundError.message}`,
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

  const lastInboundAt =
    new Date(
      lastInbound.created_at
    ).getTime();

  if (
    !Number.isFinite(
      lastInboundAt
    ) ||
    Date.now() -
      lastInboundAt >
      CUSTOMER_SERVICE_WINDOW_MS
  ) {
    redirect(
      conversationUrl(leadId, {
        error:
          'The 24-hour WhatsApp customer-service window has expired. An approved template is required.',
      })
    );
  }

  const accessToken =
    requireEnv(
      'WA_ACCESS_TOKEN'
    );

  const phoneNumberId =
    requireEnv(
      'WA_PHONE_NUMBER_ID'
    );

  const version =
    whatsappApiVersion();

  const response =
    await fetch(
      `https://graph.facebook.com/${version}/${phoneNumberId}/messages`,
      {
        method: 'POST',

        headers: {
          Authorization:
            `Bearer ${accessToken}`,

          'Content-Type':
            'application/json',
        },

        body: JSON.stringify({
          messaging_product:
            'whatsapp',

          recipient_type:
            'individual',

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

  const responseText =
    await response.text();

  let meta:
    MetaSendResponse = {};

  try {
    meta = responseText
      ? (
          JSON.parse(
            responseText
          ) as MetaSendResponse
        )
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
        error:
          `WhatsApp send failed: ${metaMessage}`,
      })
    );
  }

  const externalMessageId =
    meta.messages?.[0]?.id?.trim() ||
    null;

  /*
   * Continue using the canonical
   * CRM interaction logger.
   */

  const { error: logError } =
    await supabase.rpc(
      'log_lead_interaction',
      {
        p_lead_id:
          leadId,

        p_channel:
          'whatsapp',

        p_direction:
          'outbound',

        p_body:
          body,

        p_conversation_id:
          conversation.id,
      }
    );

  if (logError) {
    redirect(
      conversationUrl(leadId, {
        error:
          `WhatsApp was sent, but CRM logging failed: ${logError.message}. Do not resend this message until the CRM record is checked.`,
      })
    );
  }

/*
 * Attach Meta's WhatsApp message ID
 * to the CRM message we just logged.
 *
 * This allows later webhook events:
 * sent → delivered → read / failed
 * to update this exact message.
 */
if (externalMessageId) {
  const {
    error: attachError,
  } =
    await supabase.rpc(
      'attach_whatsapp_outbound_message_id',
      {
        p_lead_id:
          leadId,

        p_conversation_id:
          conversation.id,

        p_body:
          body,

        p_external_message_id:
          externalMessageId,
      }
    );

  if (attachError) {
    redirect(
      conversationUrl(
        leadId,
        {
          error:
            `WhatsApp was sent and logged, but its Meta message ID could not be attached: ${attachError.message}. Do not resend this message.`,
        }
      )
    );
  }
}

  revalidatePath(
    '/conversations'
  );

  revalidatePath(
    `/leads/${leadId}`
  );

  revalidatePath('/leads');
  revalidatePath('/dashboard');
  revalidatePath('/admissions');

  redirect(
    conversationUrl(
      leadId,
      {
        notice:
          'whatsapp-sent',

        ...(externalMessageId
          ? {
              wamid:
                externalMessageId,
            }
          : {}),
      }
    )
  );
}

export async function sendWhatsAppTemplateAction(
  leadId: string,
  formData: FormData
) {
  const templateName =
    textValue(
      formData,
      'template_name'
    );

  const language =
    textValue(
      formData,
      'template_language'
    );

  if (
    !templateName ||
    !language
  ) {
    redirect(
      conversationUrl(
        leadId,
        {
          error:
            'Select an approved WhatsApp template.',
        }
      )
    );
  }

  const supabase =
    await createClient();

  const {
    data: { user },
    error: authError,
  } =
    await supabase.auth.getUser();

  if (
    authError ||
    !user
  ) {
    redirect('/login');
  }

  /* =====================================================
     LOAD PHONE / WHATSAPP CONTACT

     A website lead may only have:
     contact_type = phone

     An existing WhatsApp lead may already have:
     contact_type = whatsapp
  ===================================================== */

  const {
    data: contacts,
    error: contactsError,
  } =
    await supabase
      .from(
        'lead_contacts'
      )
      .select(
        `
        lead_id,
        contact_type,
        value,
        normalized_value,
        is_primary,
        verified
        `
      )
      .eq(
        'lead_id',
        leadId
      )
      .in(
        'contact_type',
        [
          'whatsapp',
          'phone',
        ]
      )
      .order(
        'is_primary',
        {
          ascending: false,
        }
      );

  if (contactsError) {
    redirect(
      conversationUrl(
        leadId,
        {
          error:
            `Unable to load contact number: ${contactsError.message}`,
        }
      )
    );
  }

  const whatsappContact =
    contacts?.find(
      (contact) =>
        contact.contact_type ===
        'whatsapp'
    );

  const phoneContact =
    contacts?.find(
      (contact) =>
        contact.contact_type ===
        'phone'
    );

  /*
   * Prefer the existing WhatsApp number.
   * Otherwise use the number supplied
   * through the website/form.
   */
  const sourceContact =
    whatsappContact ||
    phoneContact;

  const to =
    normalizeWaId(
      sourceContact?.normalized_value ||
        sourceContact?.value
    );

  if (!to) {
    redirect(
      conversationUrl(
        leadId,
        {
          error:
            'This lead does not have a usable phone number for WhatsApp.',
        }
      )
    );
  }

  /*
   * E.164 international phone numbers
   * can contain at most 15 digits.
   *
   * Do not automatically guess a
   * missing country code.
   */
  if (
    to.length < 8 ||
    to.length > 15
  ) {
    redirect(
      conversationUrl(
        leadId,
        {
          error:
            'The phone number does not look complete. Add the international country code before starting WhatsApp.',
        }
      )
    );
  }

  /* =====================================================
     DUPLICATE SAFETY

     If this number is already attached as
     WhatsApp to ANOTHER lead, do not silently
     move it.

     We should merge duplicate leads separately.
  ===================================================== */

  const {
    data: existingWaOwner,
    error: ownerError,
  } =
    await supabase
      .from(
        'lead_contacts'
      )
      .select(
        `
        lead_id,
        normalized_value
        `
      )
      .eq(
        'contact_type',
        'whatsapp'
      )
      .eq(
        'normalized_value',
        to
      )
      .limit(1)
      .maybeSingle();

  if (ownerError) {
    redirect(
      conversationUrl(
        leadId,
        {
          error:
            `Unable to check existing WhatsApp identity: ${ownerError.message}`,
        }
      )
    );
  }

  if (
    existingWaOwner?.lead_id &&
    existingWaOwner.lead_id !==
      leadId
  ) {
    redirect(
      conversationUrl(
        leadId,
        {
          error:
            'This WhatsApp number already belongs to another CRM lead. Merge the duplicate lead before starting a new WhatsApp conversation.',
        }
      )
    );
  }

  /* =====================================================
     VERIFY TEMPLATE AGAINST META
  ===================================================== */

  const catalog =
    await getApprovedWhatsAppTemplates();

  if (catalog.error) {
    redirect(
      conversationUrl(
        leadId,
        {
          error:
            `Unable to load WhatsApp templates: ${catalog.error}`,
        }
      )
    );
  }

  const template =
    catalog.templates.find(
      (item) =>
        item.name ===
          templateName &&
        item.language ===
          language
    );

  if (!template) {
    redirect(
      conversationUrl(
        leadId,
        {
          error:
            'That WhatsApp template is not currently approved or available.',
        }
      )
    );
  }

  if (!template.supported) {
    redirect(
      conversationUrl(
        leadId,
        {
          error:
            template.unsupportedReason ||
            'This template type is not supported yet.',
        }
      )
    );
  }

  /* =====================================================
     TEMPLATE VARIABLES
  ===================================================== */

  const headerValues =
    Array.from(
      {
        length:
          template.headerVariableCount,
      },
      (_, index) =>
        textValue(
          formData,
          `header_param_${index + 1}`
        ) ?? ''
    );

  const bodyValues =
    Array.from(
      {
        length:
          template.bodyVariableCount,
      },
      (_, index) =>
        textValue(
          formData,
          `body_param_${index + 1}`
        ) ?? ''
    );

  if (
    headerValues.some(
      (value) =>
        !value.trim()
    ) ||
    bodyValues.some(
      (value) =>
        !value.trim()
    )
  ) {
    redirect(
      conversationUrl(
        leadId,
        {
          error:
            'Complete all required WhatsApp template fields.',
        }
      )
    );
  }

  const components:
    Array<{
      type:
        | 'header'
        | 'body';

      parameters: Array<{
        type: 'text';
        text: string;
      }>;
    }> = [];

  if (
    headerValues.length >
    0
  ) {
    components.push({
      type: 'header',

      parameters:
        headerValues.map(
          (value) => ({
            type: 'text',
            text: value,
          })
        ),
    });
  }

  if (
    bodyValues.length >
    0
  ) {
    components.push({
      type: 'body',

      parameters:
        bodyValues.map(
          (value) => ({
            type: 'text',
            text: value,
          })
        ),
    });
  }

  /* =====================================================
     SEND TEMPLATE THROUGH META
  ===================================================== */

  const accessToken =
    requireEnv(
      'WA_ACCESS_TOKEN'
    );

  const phoneNumberId =
    requireEnv(
      'WA_PHONE_NUMBER_ID'
    );

  const version =
    whatsappApiVersion();

  const response =
    await fetch(
      `https://graph.facebook.com/${version}/${phoneNumberId}/messages`,
      {
        method: 'POST',

        headers: {
          Authorization:
            `Bearer ${accessToken}`,

          'Content-Type':
            'application/json',
        },

        body:
          JSON.stringify({
            messaging_product:
              'whatsapp',

            recipient_type:
              'individual',

            to,

            type:
              'template',

            template: {
              name:
                template.name,

              language: {
                code:
                  template.language,
              },

              ...(components.length
                ? {
                    components,
                  }
                : {}),
            },
          }),

        cache:
          'no-store',
      }
    );

  const responseText =
    await response.text();

  let meta:
    MetaSendResponse = {};

  try {
    meta =
      responseText
        ? JSON.parse(
            responseText
          )
        : {};
  } catch {
    meta = {};
  }

  if (!response.ok) {
    const metaMessage =
      meta.error?.message ||
      `Meta returned HTTP ${response.status}.`;

    /*
     * IMPORTANT:
     *
     * Nothing in the CRM is converted to
     * WhatsApp when Meta rejects the number.
     *
     * The lead remains a website/form lead.
     */
    redirect(
      conversationUrl(
        leadId,
        {
          error:
            `Unable to start WhatsApp: ${metaMessage}`,
        }
      )
    );
  }

  const externalMessageId =
    meta.messages?.[0]
      ?.id?.trim() ||
    null;

  const returnedWaId =
    normalizeWaId(
      meta.contacts?.[0]
        ?.wa_id
    );

  /*
   * Meta normally returns wa_id when it
   * accepts the recipient.
   *
   * Fall back to the submitted normalized
   * number so a successful API send is not
   * lost if contacts[] is absent.
   */
  const resolvedWaId =
    returnedWaId ||
    to;

  const whatsappVerified =
    Boolean(
      returnedWaId
    );

  /* =====================================================
     SECOND DUPLICATE CHECK USING RETURNED WA_ID
  ===================================================== */

  const {
    data: resolvedOwner,
    error:
      resolvedOwnerError,
  } =
    await supabase
      .from(
        'lead_contacts'
      )
      .select(
        `
        lead_id,
        normalized_value
        `
      )
      .eq(
        'contact_type',
        'whatsapp'
      )
      .eq(
        'normalized_value',
        resolvedWaId
      )
      .limit(1)
      .maybeSingle();

  if (resolvedOwnerError) {
    redirect(
      conversationUrl(
        leadId,
        {
          error:
            `WhatsApp was sent, but CRM identity checking failed: ${resolvedOwnerError.message}. Do not resend the template.`,
        }
      )
    );
  }

  if (
    resolvedOwner?.lead_id &&
    resolvedOwner.lead_id !==
      leadId
  ) {
    redirect(
      conversationUrl(
        leadId,
        {
          error:
            'WhatsApp was sent, but Meta resolved this number to a WhatsApp identity already attached to another CRM lead. Do not resend. The two lead records need to be merged.',
        }
      )
    );
  }

  /* =====================================================
     CREATE WHATSAPP CONTACT ON EXISTING LEAD
  ===================================================== */

  if (!whatsappContact) {
    const {
      error:
        whatsappContactError,
    } =
      await supabase
        .from(
          'lead_contacts'
        )
        .insert({
          lead_id:
            leadId,

          contact_type:
            'whatsapp',

          /*
           * Keep the original submitted
           * number for human display.
           */
          value:
            sourceContact?.value ||
            resolvedWaId,

          normalized_value:
            resolvedWaId,

          is_primary:
            true,

          verified:
            whatsappVerified,
        });

    if (
      whatsappContactError
    ) {
      redirect(
        conversationUrl(
          leadId,
          {
            error:
              `WhatsApp was sent, but the CRM could not attach the WhatsApp number: ${whatsappContactError.message}. Do not resend the template.`,
          }
        )
      );
    }
  }

  /* =====================================================
     FIND EXISTING WHATSAPP CONVERSATION
  ===================================================== */

  const {
    data:
      existingConversation,
    error:
      existingConversationError,
  } =
    await supabase
      .from(
        'conversations'
      )
      .select(
        `
        id,
        lead_id,
        channel,
        last_message_at
        `
      )
      .eq(
        'lead_id',
        leadId
      )
      .eq(
        'channel',
        'whatsapp'
      )
      .order(
        'last_message_at',
        {
          ascending:
            false,

          nullsFirst:
            false,
        }
      )
      .limit(1)
      .maybeSingle();

  if (
    existingConversationError
  ) {
    redirect(
      conversationUrl(
        leadId,
        {
          error:
            `WhatsApp was sent, but the CRM could not check the conversation: ${existingConversationError.message}. Do not resend the template.`,
        }
      )
    );
  }

  let conversationId =
    existingConversation?.id ??
    null;

  /* =====================================================
     CREATE WHATSAPP CONVERSATION IF NEEDED
  ===================================================== */

  if (!conversationId) {
    const now =
      new Date().toISOString();

    const {
      data:
        createdConversation,
      error:
        createConversationError,
    } =
      await supabase
        .from(
          'conversations'
        )
        .insert({
          lead_id:
            leadId,

          channel:
            'whatsapp',

          /*
           * Your inbound WhatsApp system
           * identifies the contact using
           * their WhatsApp ID.
           */
          external_conversation_id:
            resolvedWaId,

          /*
           * Business-side WhatsApp phone
           * number ID.
           */
          external_account_id:
            phoneNumberId,

          status:
            'open',

          started_at:
            now,

          last_message_at:
            now,
        })
        .select('id')
        .single();

    if (
      createConversationError ||
      !createdConversation?.id
    ) {
      redirect(
        conversationUrl(
          leadId,
          {
            error:
              `WhatsApp was sent, but the CRM conversation could not be created: ${
                createConversationError
                  ?.message ||
                'Unknown conversation error'
              }. Do not resend the template.`,
          }
        )
      );
    }

    conversationId =
      createdConversation.id;
  }

  /* =====================================================
     RENDER READABLE MESSAGE FOR CRM HISTORY
  ===================================================== */

  const renderedHeader =
    renderTemplateText(
      template.headerText,
      headerValues
    );

  const renderedBody =
    renderTemplateText(
      template.bodyText,
      bodyValues
    );

  const crmBody =
    [
      renderedHeader,
      renderedBody,
      template.footerText,
    ]
      .filter(Boolean)
      .join('\n\n') ||
    `WhatsApp template: ${template.name}`;

  /* =====================================================
     LOG WHATSAPP MESSAGE
  ===================================================== */

  const {
    error: logError,
  } =
    await supabase.rpc(
      'log_lead_interaction',
      {
        p_lead_id:
          leadId,

        p_channel:
          'whatsapp',

        p_direction:
          'outbound',

        p_body:
          crmBody,

        p_conversation_id:
          conversationId,
      }
    );

  if (logError) {
    redirect(
      conversationUrl(
        leadId,
        {
          error:
            `WhatsApp was sent, but CRM message logging failed: ${logError.message}. Do not resend this template.`,
        }
      )
    );
  }

  /*
 * Attach Meta's WhatsApp message ID
 * to the outbound template message.
 *
 * This lets Meta webhook status events
 * update this exact CRM message:
 *
 * sent → delivered → read / failed
 */
if (externalMessageId) {
  const {
    error: attachError,
  } =
    await supabase.rpc(
      'attach_whatsapp_outbound_message_id',
      {
        p_lead_id:
          leadId,

        p_conversation_id:
          conversationId,

        p_body:
          crmBody,

        p_external_message_id:
          externalMessageId,
      }
    );

  if (attachError) {
    redirect(
      conversationUrl(
        leadId,
        {
          error:
            `WhatsApp template was sent and logged, but its Meta message ID could not be attached: ${attachError.message}. Do not resend this template.`,
        }
      )
    );
  }
}

  /* =====================================================
     SWITCH CURRENT COMMUNICATION CHANNEL

     IMPORTANT:
     We DO NOT change:
     - first touch
     - lead creation source
     - website attribution
     - campaign attribution

     Only the current conversation channel
     becomes WhatsApp.
  ===================================================== */

  const {
    error:
      leadUpdateError,
  } =
    await supabase
      .from('leads')
      .update({
        current_contact_channel:
          'whatsapp',
      })
      .eq(
        'id',
        leadId
      );

  if (leadUpdateError) {
    redirect(
      conversationUrl(
        leadId,
        {
          error:
            `WhatsApp was sent and logged, but the lead channel could not be updated: ${leadUpdateError.message}. Do not resend.`,
        }
      )
    );
  }

  revalidatePath(
    '/conversations'
  );

  revalidatePath(
    `/leads/${leadId}`
  );

  revalidatePath('/leads');
  revalidatePath('/dashboard');
  revalidatePath('/admissions');
  revalidatePath('/pipeline');
  revalidatePath('/funnel');

  redirect(
    conversationUrl(
      leadId,
      {
        notice:
          'whatsapp-started',

        ...(externalMessageId
          ? {
              wamid:
                externalMessageId,
            }
          : {}),
      }
    )
  );
}

export async function markConversationReadAction(
  leadId: string
) {
  if (useMockData) {
    return {
      ok: true,
    };
  }

  const supabase =
    await createClient();

  const {
    data: { user },
    error: authError,
  } =
    await supabase.auth.getUser();

  if (
    authError ||
    !user
  ) {
    return {
      ok: false,
      error:
        'Not authenticated.',
    };
  }

  const now =
    new Date().toISOString();

  const {
    error,
  } =
    await supabase
      .from(
        'lead_inbox_reads'
      )
      .upsert(
        {
          user_id:
            user.id,

          lead_id:
            leadId,

          last_read_at:
            now,

          updated_at:
            now,
        },
        {
          onConflict:
            'user_id,lead_id',
        }
      );

  if (error) {
    console.error(
      'Unable to mark conversation as read:',
      error
    );

    return {
      ok: false,
      error:
        error.message,
    };
  }

  return {
    ok: true,
  };
}