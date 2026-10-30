import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Channel } from "@/types/crm";

export type MessagingReplyMode =
  | "freeform"
  | "template"
  | "draft_only"
  | "manual_log_only"
  | "blocked";

export type MessagingEligibility = {
  channel: Channel;
  canReply: boolean;
  replyMode: MessagingReplyMode;
  freeformAllowed: boolean;
  templateRequired: boolean;
  humanApprovalRequired: boolean;
  providerConnected: boolean | null;
  providerHealthy: boolean | null;
  windowExpiresAt: string | null;
  reasons: string[];
  userMessage: string;
};

type WhatsAppWindow = {
  open: boolean;
  label: string;
} | null;

type InstagramPolicy = {
  allowed?: boolean;
  reasons?: unknown;
};

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function instagramMessage(reasons: string[]) {
  if (reasons.includes("instagram_24h_window_closed")) {
    return "The Instagram reply window is closed. The customer must message the connected account again before another API reply can be sent.";
  }
  if (reasons.includes("instagram_user_initiation_missing")) {
    return "Instagram requires the customer to start the conversation before SalsysOS can reply through the API.";
  }
  if (reasons.includes("instagram_recipient_suppressed")) {
    return "This Instagram recipient is suppressed and cannot be messaged.";
  }
  if (reasons.includes("instagram_messaging_connection_unavailable")) {
    return "Instagram messaging is unavailable for this workspace. Check Settings → Integrations.";
  }
  if (reasons.includes("human_approval_required")) {
    return "This Instagram reply requires human approval before sending.";
  }
  if (reasons.includes("instagram_frequency_limited")) {
    return "Instagram messaging is temporarily frequency-limited for this conversation.";
  }
  return reasons.length
    ? "Instagram reply is currently blocked by provider policy."
    : "Instagram reply is currently unavailable.";
}

function whatsappEligibility(window: WhatsAppWindow): MessagingEligibility {
  if (window?.open) {
    return {
      channel: "whatsapp",
      canReply: true,
      replyMode: "freeform",
      freeformAllowed: true,
      templateRequired: false,
      humanApprovalRequired: true,
      providerConnected: null,
      providerHealthy: null,
      windowExpiresAt: null,
      reasons: [],
      userMessage: window.label || "WhatsApp free-form reply is available.",
    };
  }

  return {
    channel: "whatsapp",
    canReply: true,
    replyMode: "template",
    freeformAllowed: false,
    templateRequired: true,
    humanApprovalRequired: true,
    providerConnected: null,
    providerHealthy: null,
    windowExpiresAt: null,
    reasons: ["whatsapp_service_window_closed"],
    userMessage:
      window?.label ||
      "The WhatsApp service window is closed. Use an approved template to continue.",
  };
}

async function instagramEligibility(
  leadId: string,
  organizationId: string,
): Promise<MessagingEligibility> {
  const supabase = await createClient();
  const { data: canWorkLead, error: accessError } = await supabase.rpc(
    "can_work_lead",
    { p_lead_id: leadId },
  );

  if (accessError || canWorkLead !== true) {
    return {
      channel: "instagram",
      canReply: false,
      replyMode: "blocked",
      freeformAllowed: false,
      templateRequired: false,
      humanApprovalRequired: true,
      providerConnected: null,
      providerHealthy: null,
      windowExpiresAt: null,
      reasons: ["lead_access_denied"],
      userMessage: "You do not have permission to reply to this conversation.",
    };
  }

  const admin = createAdminClient();
  const { data: conversation, error: conversationError } = await admin
    .from("conversations")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("lead_id", leadId)
    .eq("channel", "instagram")
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (conversationError || !conversation?.id) {
    return {
      channel: "instagram",
      canReply: false,
      replyMode: "blocked",
      freeformAllowed: false,
      templateRequired: false,
      humanApprovalRequired: true,
      providerConnected: null,
      providerHealthy: null,
      windowExpiresAt: null,
      reasons: ["instagram_conversation_missing"],
      userMessage:
        "No eligible Instagram conversation exists yet. The customer must message the connected account first.",
    };
  }

  const { data, error } = await admin.rpc("evaluate_instagram_dm_send_policy_v1", {
    p_organization_id: organizationId,
    p_conversation_id: conversation.id,
    p_now: new Date().toISOString(),
    p_automated: false,
    p_human_approved: true,
  });

  if (error) {
    return {
      channel: "instagram",
      canReply: false,
      replyMode: "blocked",
      freeformAllowed: false,
      templateRequired: false,
      humanApprovalRequired: true,
      providerConnected: null,
      providerHealthy: false,
      windowExpiresAt: null,
      reasons: ["instagram_policy_unavailable"],
      userMessage: "Instagram reply policy could not be verified. Sending is blocked until it can be checked safely.",
    };
  }

  const policy = objectValue(data) as InstagramPolicy;
  const reasons = stringArray(policy.reasons);
  const allowed = policy.allowed === true;

  return {
    channel: "instagram",
    canReply: allowed,
    replyMode: allowed ? "freeform" : "blocked",
    freeformAllowed: allowed,
    templateRequired: false,
    humanApprovalRequired: true,
    providerConnected: reasons.includes("instagram_messaging_connection_unavailable")
      ? false
      : null,
    providerHealthy: allowed ? true : null,
    windowExpiresAt: null,
    reasons,
    userMessage: allowed
      ? "Instagram reply is currently eligible. Provider policy will be checked again when you send."
      : instagramMessage(reasons),
  };
}

export async function getMessagingEligibility(input: {
  leadId: string;
  organizationId: string | null;
  channel: Channel;
  whatsappWindow?: WhatsAppWindow;
  canStartWhatsApp?: boolean;
}): Promise<MessagingEligibility> {
  if (input.channel === "whatsapp") {
    return whatsappEligibility(input.whatsappWindow ?? null);
  }

  if (input.channel === "instagram") {
    if (!input.organizationId) {
      return {
        channel: "instagram",
        canReply: false,
        replyMode: "blocked",
        freeformAllowed: false,
        templateRequired: false,
        humanApprovalRequired: true,
        providerConnected: null,
        providerHealthy: null,
        windowExpiresAt: null,
        reasons: ["workspace_unresolved"],
        userMessage: "The active workspace could not be resolved, so Instagram sending is blocked.",
      };
    }
    return instagramEligibility(input.leadId, input.organizationId);
  }

  if (input.canStartWhatsApp) {
    return {
      channel: "whatsapp",
      canReply: true,
      replyMode: "template",
      freeformAllowed: false,
      templateRequired: true,
      humanApprovalRequired: true,
      providerConnected: null,
      providerHealthy: null,
      windowExpiresAt: null,
      reasons: ["whatsapp_template_required_to_start"],
      userMessage: "Use an approved WhatsApp template to start this conversation.",
    };
  }

  return {
    channel: input.channel,
    canReply: false,
    replyMode: "draft_only",
    freeformAllowed: false,
    templateRequired: false,
    humanApprovalRequired: true,
    providerConnected: null,
    providerHealthy: null,
    windowExpiresAt: null,
    reasons: ["direct_provider_send_unavailable"],
    userMessage: "You can prepare a draft or internal note, but direct provider sending is not available for this channel yet.",
  };
}
