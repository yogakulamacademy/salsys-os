"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getInstagramRuntimeForOrganization } from "@/lib/integrations/instagram-connection";

const DEFAULT_INSTAGRAM_API_VERSION = "v26.0";
const MAX_INSTAGRAM_TEXT_LENGTH = 1000;

type InstagramSendResponse = {
  recipient_id?: string;
  message_id?: string;
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
};

function textValue(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

function conversationUrl(leadId: string, params: Record<string, string>) {
  const search = new URLSearchParams({
    lead: leadId,
    ...params,
  });

  return `/conversations?${search.toString()}`;
}

function instagramApiVersion() {
  const value =
    process.env.INSTAGRAM_API_VERSION?.trim() || DEFAULT_INSTAGRAM_API_VERSION;

  return /^v\d+\.\d+$/.test(value)
    ? value
    : DEFAULT_INSTAGRAM_API_VERSION;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function instagramRecipientId(conversation: {
  external_conversation_id?: string | null;
  metadata?: unknown;
}) {
  const metadata = objectValue(conversation.metadata);
  const metadataUserId = stringValue(metadata.instagram_user_id);

  if (metadataUserId) {
    return metadataUserId;
  }

  const externalConversationId = stringValue(
    conversation.external_conversation_id,
  );

  if (!externalConversationId) {
    return "";
  }

  const separatorIndex = externalConversationId.indexOf(":");

  return separatorIndex >= 0
    ? externalConversationId.slice(separatorIndex + 1).trim()
    : externalConversationId;
}

export async function sendInstagramMessageAction(
  leadId: string,
  formData: FormData,
) {
  const body = textValue(formData, "body");

  if (!body) {
    redirect(
      conversationUrl(leadId, {
        error: "Instagram message text is required.",
      }),
    );
  }

  if (body.length > MAX_INSTAGRAM_TEXT_LENGTH) {
    redirect(
      conversationUrl(leadId, {
        error: `Instagram text messages are limited to ${MAX_INSTAGRAM_TEXT_LENGTH} characters.`,
      }),
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/login");
  }

  const { data: canWorkLead, error: accessError } = await supabase.rpc(
    "can_work_lead",
    {
      p_lead_id: leadId,
    },
  );

  if (accessError || canWorkLead !== true) {
    redirect(
      conversationUrl(leadId, {
        error:
          accessError?.message || "You do not have access to this lead.",
      }),
    );
  }

  const admin = createAdminClient();

  const { data: lead, error: leadError } = await admin
    .from("leads")
    .select("organization_id")
    .eq("id", leadId)
    .maybeSingle();

  if (leadError || !lead?.organization_id) {
    redirect(
      conversationUrl(leadId, {
        error: "Unable to determine the organization for this lead.",
      }),
    );
  }

  const organizationId = String(lead.organization_id);

  const { data: conversation, error: conversationError } = await admin
    .from("conversations")
    .select(
      "id, organization_id, lead_id, external_conversation_id, external_account_id, metadata, last_message_at",
    )
    .eq("organization_id", organizationId)
    .eq("lead_id", leadId)
    .eq("channel", "instagram")
    .order("last_message_at", {
      ascending: false,
      nullsFirst: false,
    })
    .limit(1)
    .maybeSingle();

  if (conversationError) {
    redirect(
      conversationUrl(leadId, {
        error: `Unable to load Instagram conversation: ${conversationError.message}`,
      }),
    );
  }

  if (!conversation?.id) {
    redirect(
      conversationUrl(leadId, {
        error:
          "No Instagram conversation exists for this lead yet. The Instagram user must message the connected professional account first.",
      }),
    );
  }

  const accountId = stringValue(conversation.external_account_id);
  const recipientId = instagramRecipientId(conversation);

  if (!accountId || !recipientId) {
    redirect(
      conversationUrl(leadId, {
        error:
          "This Instagram conversation is missing its provider account or recipient identity.",
      }),
    );
  }

  let runtime;

  try {
    runtime = await getInstagramRuntimeForOrganization(
      organizationId,
      accountId,
    );
  } catch (error) {
    redirect(
      conversationUrl(leadId, {
        error:
          error instanceof Error
            ? error.message
            : "Instagram is not connected for this workspace.",
      }),
    );
  }

  const version = instagramApiVersion();
  const response = await fetch(
    `https://graph.instagram.com/${version}/${encodeURIComponent(
      runtime.accountId,
    )}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${runtime.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        recipient: {
          id: recipientId,
        },
        message: {
          text: body,
        },
      }),
      cache: "no-store",
    },
  );

  const responseText = await response.text();
  let meta: InstagramSendResponse = {};

  try {
    meta = responseText
      ? (JSON.parse(responseText) as InstagramSendResponse)
      : {};
  } catch {
    meta = {};
  }

  if (!response.ok) {
    const metaMessage =
      meta.error?.message || `Instagram returned HTTP ${response.status}.`;

    console.error("Instagram Send API error", {
      status: response.status,
      message: metaMessage,
      code: meta.error?.code,
      subcode: meta.error?.error_subcode,
      type: meta.error?.type,
      fbtraceId: meta.error?.fbtrace_id,
      organizationId,
      connectionId: runtime.connectionId,
      accountId: runtime.accountId,
    });

    redirect(
      conversationUrl(leadId, {
        error: `Instagram send failed: ${metaMessage}`,
      }),
    );
  }

  const externalMessageId = stringValue(meta.message_id) || null;
  const returnedRecipientId = stringValue(meta.recipient_id);

  if (returnedRecipientId && returnedRecipientId !== recipientId) {
    console.error("Instagram Send API recipient mismatch", {
      organizationId,
      accountId,
      expectedRecipientId: recipientId,
      returnedRecipientId,
    });

    redirect(
      conversationUrl(leadId, {
        error:
          "Instagram accepted the send but returned an unexpected recipient identity. Do not resend until the CRM record is checked.",
      }),
    );
  }

  const { data: loggedMessage, error: logError } = await supabase.rpc(
    "log_lead_interaction",
    {
      p_lead_id: leadId,
      p_channel: "instagram",
      p_direction: "outbound",
      p_body: body,
      p_conversation_id: conversation.id,
    },
  );

  if (logError) {
    redirect(
      conversationUrl(leadId, {
        error: `Instagram was sent, but CRM logging failed: ${logError.message}. Do not resend this message until the CRM record is checked.`,
      }),
    );
  }

  const loggedRow = Array.isArray(loggedMessage)
    ? loggedMessage[0]
    : loggedMessage;
  const crmMessageId = stringValue(
    objectValue(loggedRow).id,
  );

  if (externalMessageId && crmMessageId) {
    const { error: attachError } = await admin
      .from("messages")
      .update({
        external_message_id: externalMessageId,
        status: "sent",
        sent_at: new Date().toISOString(),
      })
      .eq("id", crmMessageId)
      .eq("organization_id", organizationId)
      .eq("lead_id", leadId)
      .eq("conversation_id", conversation.id);

    if (attachError) {
      redirect(
        conversationUrl(leadId, {
          error: `Instagram was sent and logged, but its provider message ID could not be attached: ${attachError.message}. Do not resend this message.`,
        }),
      );
    }
  }

  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
  revalidatePath("/dashboard");
  revalidatePath("/admissions");
  revalidatePath("/conversations");

  return {
    ok: true as const,
    message: {
      id: crmMessageId || null,
      body,
      direction: "outbound" as const,
      senderType: "human" as const,
      channel: "instagram" as const,
      status: "sent" as const,
      externalMessageId,
      createdAt: new Date().toISOString(),
    },
  };
}
