import type { Channel, LeadStage } from "@/types/crm";

import type { ConversationLeadSummary } from "@/components/conversations-sidebar";

import { getLead, getLeads, isMockMode } from "@/lib/data";

import { createClient } from "@/lib/supabase/server";

const CUSTOMER_SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

async function getCurrentOrganizationId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<string> {
  const { data: memberships, error: membershipError } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", userId)
    .eq("active", true)
    .limit(2);

  if (membershipError) {
    throw new Error(
      `Unable to resolve current organization: ${membershipError.message}`,
    );
  }

  if (!memberships || memberships.length === 0) {
    throw new Error("No active organization membership was found.");
  }

  if (memberships.length > 1) {
    throw new Error(
      "Multiple active organization memberships were found. Workspace selection is required.",
    );
  }

  return String(memberships[0].organization_id);
}

export type ConversationWorkspaceMessage = {
  id: string;
  direction: "inbound" | "outbound";
  sender: string;
  body: string;
  timestamp: string;
  channel: Channel;
  status?: string;
  externalMessageId?: string | null;
  sentAt?: string | null;
  deliveredAt?: string | null;
  readAt?: string | null;
};

export type ConversationWorkspaceSelected = {
  id: string;
  name: string;
  course: string;
  country: string;
  stage: LeadStage;
  currentContactChannel: Channel;
  leadCreationChannel: Channel;
  lastContactedAt?: string;
  createdAt: string;
  phone?: string;
  interestedCourseId?: string;
  lastMessages: ConversationWorkspaceMessage[];
};

export type ConversationWorkspaceMetrics = {
  activeConversations: number;
  whatsappCount: number;
  highIntentCount: number;
};

export type ConversationWorkspaceResult = {
  conversationSummary: ConversationLeadSummary[];
  selectedId?: string;
  selected: ConversationWorkspaceSelected | null;
  whatsappWindow: {
    open: boolean;
    label: string;
  } | null;
  metrics: ConversationWorkspaceMetrics;
  optimized: boolean;
};

type RpcInboxRow = {
  id?: string;
  name?: string | null;
  course?: string | null;
  country?: string | null;
  stage?: string | null;
  currentContactChannel?: string | null;
  lastContactedAt?: string | null;
  unread?: boolean | null;
  needsReply?: boolean | null;
  needsFirstContact?: boolean | null;
  priority?: string | null;
  waitingSince?: string | null;
};

type RpcMessageRow = {
  id?: string;
  direction?: string | null;
  sender?: string | null;
  body?: string | null;
  timestamp?: string | null;
  channel?: string | null;
  status?: string | null;
  externalMessageId?: string | null;
  sentAt?: string | null;
  deliveredAt?: string | null;
  readAt?: string | null;
};

type RpcSelectedRow = {
  id?: string;
  name?: string | null;
  course?: string | null;
  country?: string | null;
  stage?: string | null;
  currentContactChannel?: string | null;
  leadCreationChannel?: string | null;
  lastContactedAt?: string | null;
  createdAt?: string | null;
  phone?: string | null;
  interestedCourseId?: string | null;
  lastMessages?: RpcMessageRow[] | null;
};

type RpcPayload = {
  inbox?: RpcInboxRow[] | null;
  selectedId?: string | null;
  selected?: RpcSelectedRow | null;
  whatsapp?: {
    hasConversation?: boolean | null;
    lastInboundAt?: string | null;
  } | null;
  metrics?: {
    activeConversations?: number | string | null;
    whatsappCount?: number | string | null;
    highIntentCount?: number | string | null;
  } | null;
};

type LegacyInboxState = {
  latestMessageAt: string | null;
  lastInboundAt: string | null;
  needsReply: boolean;
  lastReadAt: string | null;
};

type ConversationPriority = "urgent" | "high" | "normal" | "waiting";

export async function getConversationsWorkspace(
  requestedLeadId?: string,
): Promise<ConversationWorkspaceResult> {
  if (isMockMode()) {
    return getLegacyWorkspace(requestedLeadId, true);
  }

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_conversations_workspace", {
    p_selected_lead_id: isUuid(requestedLeadId) ? requestedLeadId : null,
    p_limit: 300,
  });

  if (error) {
    console.warn(
      "[conversations] Optimized workspace RPC failed; using legacy loader:",
      error.message,
    );

    return getLegacyWorkspace(requestedLeadId, false);
  }

  const payload = unwrapPayload(data);

  const selectedId = textOrUndefined(payload.selectedId);

  const conversationSummary = normalizeInbox(payload.inbox, selectedId);

  const selected = normalizeSelected(payload.selected);

  const metrics = {
    activeConversations:
      toNumber(payload.metrics?.activeConversations) ||
      conversationSummary.length,

    whatsappCount: toNumber(payload.metrics?.whatsappCount),

    highIntentCount: toNumber(payload.metrics?.highIntentCount),
  };

  return {
    conversationSummary,

    selectedId,

    selected,

    whatsappWindow:
      selected?.currentContactChannel === "whatsapp"
        ? buildWhatsAppWindow(
            Boolean(payload.whatsapp?.hasConversation),
            payload.whatsapp?.lastInboundAt ?? null,
          )
        : null,

    metrics,

    optimized: true,
  };
}

function unwrapPayload(value: unknown): RpcPayload {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const row = value as Record<string, unknown>;

    if (
      row.conversations_workspace &&
      typeof row.conversations_workspace === "object"
    ) {
      return row.conversations_workspace as RpcPayload;
    }

    if (row.workspace && typeof row.workspace === "object") {
      return row.workspace as RpcPayload;
    }

    if (row.data && typeof row.data === "object" && !Array.isArray(row.data)) {
      return row.data as RpcPayload;
    }

    return row as RpcPayload;
  }

  return {};
}

function normalizeInbox(
  rows: RpcInboxRow[] | null | undefined,
  selectedId?: string,
): ConversationLeadSummary[] {
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows
    .filter(
      (
        row,
      ): row is RpcInboxRow & {
        id: string;
      } => Boolean(row && typeof row.id === "string"),
    )
    .map((row) => ({
      id: row.id,

      name: row.name || "Lead",

      course: row.course || "",

      country: row.country || "",

      stage: asLeadStage(row.stage),

      currentContactChannel: asChannel(row.currentContactChannel),

      lastContactedAt: row.lastContactedAt ?? null,

      /*
       * Keep the existing visual behavior:
       * selecting a conversation clears
       * the unread dot immediately while
       * ConversationReadMarker persists it.
       */
      unread: row.id === selectedId ? false : Boolean(row.unread),

      needsReply: Boolean(row.needsReply),

      needsFirstContact: Boolean(row.needsFirstContact),

      priority: asPriority(row.priority),

      waitingSince: row.waitingSince ?? null,
    }));
}

function normalizeSelected(
  row: RpcSelectedRow | null | undefined,
): ConversationWorkspaceSelected | null {
  if (!row?.id || !row.createdAt) {
    return null;
  }

  const messages = Array.isArray(row.lastMessages)
    ? row.lastMessages
        .filter(
          (
            message,
          ): message is RpcMessageRow & {
            id: string;
            timestamp: string;
          } => Boolean(message?.id && message.timestamp),
        )
        .map(
          (message): ConversationWorkspaceMessage => ({
            id: message.id,

            direction: message.direction === "inbound" ? "inbound" : "outbound",

            sender: message.sender || "Admissions",

            body: message.body || "[Non-text message]",

            timestamp: message.timestamp,

            channel: asChannel(message.channel),

            status: message.status ?? undefined,

            externalMessageId: message.externalMessageId ?? null,

            sentAt: message.sentAt ?? null,

            deliveredAt: message.deliveredAt ?? null,

            readAt: message.readAt ?? null,
          }),
        )
    : [];

  return {
    id: row.id,

    name: row.name || "Lead",

    course: row.course || "Not selected",

    country: row.country || "—",

    stage: asLeadStage(row.stage),

    currentContactChannel: asChannel(row.currentContactChannel),

    leadCreationChannel: asChannel(row.leadCreationChannel),

    lastContactedAt: row.lastContactedAt ?? undefined,

    createdAt: row.createdAt,

    phone: row.phone ?? undefined,

    interestedCourseId: row.interestedCourseId ?? undefined,

    lastMessages: messages,
  };
}

async function getLegacyWorkspace(
  requestedLeadId: string | undefined,
  mock: boolean,
): Promise<ConversationWorkspaceResult> {
  const allLeads = await getLeads();

  const conversationCandidates = allLeads
    .filter(
      (lead) =>
        Boolean(lead.lastContactedAt) ||
        lead.leadCreationChannel === "website" ||
        lead.currentContactChannel === "website",
    )
    .slice(0, 300);

  const inboxStateMap = mock
    ? new Map<string, LegacyInboxState>()
    : await getLegacyInboxStateMap();

  const conversationLeads = [...conversationCandidates].sort((a, b) =>
    compareLegacyConversationLeads(a, b, inboxStateMap),
  );

  const requestedExists = requestedLeadId
    ? allLeads.some((lead) => lead.id === requestedLeadId)
    : false;

  const selectedId = requestedExists
    ? requestedLeadId
    : conversationLeads[0]?.id;

  const selectedLead = selectedId ? await getLead(selectedId) : null;

  const conversationSummary: ConversationLeadSummary[] = conversationLeads.map(
    (lead) => {
      const state = inboxStateMap.get(lead.id);

      const attention = getLegacyAttention(lead, state);

      return {
        id: lead.id,

        name: lead.name,

        course: lead.course || "",

        country: lead.country || "",

        stage: lead.stage,

        currentContactChannel: lead.currentContactChannel,

        lastContactedAt:
          state?.latestMessageAt ||
          lead.lastContactedAt ||
          lead.createdAt ||
          null,

        unread: lead.id === selectedId ? false : attention.unread,

        needsReply: attention.needsReply,

        needsFirstContact: attention.needsFirstContact,

        priority: attention.priority,

        waitingSince: attention.waitingSince,
      };
    },
  );

  const selected = selectedLead
    ? {
        id: selectedLead.id,

        name: selectedLead.name,

        course: selectedLead.course || "Not selected",

        country: selectedLead.country || "—",

        stage: selectedLead.stage,

        currentContactChannel: selectedLead.currentContactChannel,

        leadCreationChannel: selectedLead.leadCreationChannel,

        lastContactedAt: selectedLead.lastContactedAt,

        createdAt: selectedLead.createdAt,

        phone: selectedLead.phone,

        interestedCourseId: selectedLead.interestedCourseId,

        lastMessages:
          selectedLead.lastMessages as ConversationWorkspaceMessage[],
      }
    : null;

  return {
    conversationSummary,

    selectedId,

    selected,

    whatsappWindow:
      selected && selected.currentContactChannel === "whatsapp" && !mock
        ? await getLegacyWhatsAppWindow(selected.id)
        : selected && selected.currentContactChannel === "whatsapp"
          ? {
              open: false,
              label:
                "Mock mode — WhatsApp service-window state is not persisted.",
            }
          : null,

    metrics: {
      activeConversations: conversationLeads.length,

      whatsappCount: conversationLeads.filter(
        (lead) => lead.currentContactChannel === "whatsapp",
      ).length,

      highIntentCount: conversationLeads.filter(
        (lead) =>
          lead.stage === "high_intent" || lead.stage === "payment_pending",
      ).length,
    },

    optimized: false,
  };
}

async function getLegacyInboxStateMap() {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error(
      "Unable to load conversation attention state: user is not authenticated.",
    );
  }

  const organizationId = await getCurrentOrganizationId(supabase, user.id);

  const { data: attentionRows, error: attentionError } = await supabase
    .from("v_lead_inbox_attention")
    .select(
      `
          lead_id,
          latest_message_at,
          last_inbound_at,
          needs_reply
        `,
    )
    .eq("organization_id", organizationId)
    .limit(1000);

  if (attentionError) {
    throw new Error(
      `Unable to load conversation attention state: ${attentionError.message}`,
    );
  }

  let readRows: Array<{
    lead_id: string;
    last_read_at: string | null;
  }> = [];

  if (user) {
    const { data, error } = await supabase
      .from("lead_inbox_reads")
      .select(
        `
            lead_id,
            last_read_at
          `,
      )
      .eq("user_id", user.id)
      .limit(1000);

    if (error) {
      throw new Error(`Unable to load inbox read state: ${error.message}`);
    }

    readRows = data ?? [];
  }

  const readMap = new Map<string, string | null>(
    readRows.map((row) => [row.lead_id, row.last_read_at]),
  );

  const result = new Map<string, LegacyInboxState>();

  for (const row of attentionRows ?? []) {
    result.set(row.lead_id, {
      latestMessageAt: row.latest_message_at ?? null,

      lastInboundAt: row.last_inbound_at ?? null,

      needsReply: Boolean(row.needs_reply),

      lastReadAt: readMap.get(row.lead_id) ?? null,
    });
  }

  return result;
}

function getLegacyAttention(
  lead: {
    stage: string;
    createdAt?: string;
    lastContactedAt?: string;
  },
  state: LegacyInboxState | undefined,
) {
  const needsReply = Boolean(state?.needsReply);

  const needsFirstContact = !state?.latestMessageAt && !lead.lastContactedAt;

  const unread = Boolean(
    state?.lastInboundAt &&
    (!state.lastReadAt ||
      new Date(state.lastInboundAt).getTime() >
        new Date(state.lastReadAt).getTime()),
  );

  const waitingSince = needsReply
    ? (state?.lastInboundAt ?? state?.latestMessageAt ?? null)
    : needsFirstContact
      ? (lead.createdAt ?? null)
      : null;

  const waitingMinutes = waitingSince
    ? Math.max(
        0,
        Math.floor((Date.now() - new Date(waitingSince).getTime()) / 60000),
      )
    : 0;

  let priority: ConversationPriority = "waiting";

  if (needsReply || needsFirstContact) {
    if (
      waitingMinutes >= 240 ||
      ((lead.stage === "payment_pending" || lead.stage === "high_intent") &&
        waitingMinutes >= 60)
    ) {
      priority = "urgent";
    } else if (
      waitingMinutes >= 60 ||
      lead.stage === "payment_pending" ||
      lead.stage === "high_intent" ||
      lead.stage === "qualified" ||
      needsFirstContact
    ) {
      priority = "high";
    } else {
      priority = "normal";
    }
  }

  return {
    unread,
    needsReply,
    needsFirstContact,
    waitingSince,
    waitingMinutes,
    priority,
    needsAttention: needsReply || needsFirstContact,
  };
}

function compareLegacyConversationLeads(
  a: {
    id: string;
    stage: string;
    createdAt?: string;
    lastContactedAt?: string;
  },
  b: {
    id: string;
    stage: string;
    createdAt?: string;
    lastContactedAt?: string;
  },
  stateMap: Map<string, LegacyInboxState>,
) {
  const attentionA = getLegacyAttention(a, stateMap.get(a.id));

  const attentionB = getLegacyAttention(b, stateMap.get(b.id));

  if (attentionA.needsAttention !== attentionB.needsAttention) {
    return attentionA.needsAttention ? -1 : 1;
  }

  const priorityRank: Record<ConversationPriority, number> = {
    urgent: 3,
    high: 2,
    normal: 1,
    waiting: 0,
  };

  const rankDifference =
    priorityRank[attentionB.priority] - priorityRank[attentionA.priority];

  if (rankDifference !== 0) {
    return rankDifference;
  }

  if (attentionA.unread !== attentionB.unread) {
    return attentionA.unread ? -1 : 1;
  }

  if (attentionA.needsAttention && attentionB.needsAttention) {
    return attentionB.waitingMinutes - attentionA.waitingMinutes;
  }

  const activityA =
    stateMap.get(a.id)?.latestMessageAt ||
    a.lastContactedAt ||
    a.createdAt ||
    "";

  const activityB =
    stateMap.get(b.id)?.latestMessageAt ||
    b.lastContactedAt ||
    b.createdAt ||
    "";

  return new Date(activityB).getTime() - new Date(activityA).getTime();
}

async function getLegacyWhatsAppWindow(leadId: string) {
  const supabase = await createClient();

  const { data: conversation } = await supabase
    .from("conversations")
    .select("id")
    .eq("lead_id", leadId)
    .eq("channel", "whatsapp")
    .order("last_message_at", {
      ascending: false,
      nullsFirst: false,
    })
    .limit(1)
    .maybeSingle();

  if (!conversation?.id) {
    return {
      open: false,

      label:
        "No WhatsApp conversation yet — an approved template is required to start one.",
    };
  }

  const { data: lastInbound } = await supabase
    .from("messages")
    .select("created_at")
    .eq("conversation_id", conversation.id)
    .eq("direction", "inbound")
    .order("created_at", {
      ascending: false,
    })
    .limit(1)
    .maybeSingle();

  return buildWhatsAppWindow(true, lastInbound?.created_at ?? null);
}

function buildWhatsAppWindow(
  hasConversation: boolean,
  lastInboundAt: string | null,
) {
  if (!hasConversation) {
    return {
      open: false,

      label:
        "No WhatsApp conversation yet — an approved template is required to start one.",
    };
  }

  if (!lastInboundAt) {
    return {
      open: false,

      label: "No inbound WhatsApp message found — use an approved template.",
    };
  }

  const inboundAt = new Date(lastInboundAt).getTime();

  const age = Date.now() - inboundAt;

  if (!Number.isFinite(inboundAt) || age > CUSTOMER_SERVICE_WINDOW_MS) {
    return {
      open: false,

      label:
        "24-hour customer-service window expired — approved template required.",
    };
  }

  const remaining = CUSTOMER_SERVICE_WINDOW_MS - age;

  return {
    open: true,

    label: `WhatsApp customer-service window open · ${formatRemaining(
      remaining,
    )} remaining`,
  };
}

function formatRemaining(milliseconds: number) {
  const totalMinutes = Math.max(0, Math.floor(milliseconds / 60000));

  const hours = Math.floor(totalMinutes / 60);

  const minutes = totalMinutes % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m`;
}

function asPriority(value: string | null | undefined): ConversationPriority {
  if (value === "urgent" || value === "high" || value === "normal") {
    return value;
  }

  return "waiting";
}

function asChannel(value: string | null | undefined): Channel {
  const allowed: Channel[] = [
    "website",
    "instagram",
    "whatsapp",
    "email",
    "phone",
    "meta_lead_form",
    "other",
  ];

  return allowed.includes(value as Channel) ? (value as Channel) : "other";
}

function asLeadStage(value: string | null | undefined): LeadStage {
  const allowed: LeadStage[] = [
    "new",
    "contacted",
    "engaged",
    "qualified",
    "high_intent",
    "payment_pending",
    "enrolled",
    "nurture",
    "not_now",
    "lost",
    "unqualified",
    "duplicate",
  ];

  return allowed.includes(value as LeadStage) ? (value as LeadStage) : "new";
}

function isUuid(value: string | undefined) {
  return Boolean(
    value &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    ),
  );
}

function textOrUndefined(value: unknown) {
  return typeof value === "string" && value ? value : undefined;
}

function toNumber(value: number | string | null | undefined) {
  const number = Number(value ?? 0);

  return Number.isFinite(number) ? number : 0;
}
