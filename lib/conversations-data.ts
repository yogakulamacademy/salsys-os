import "server-only";

import type {
  ConversationLeadSummary,
  ConversationPriority,
} from "@/components/conversations-sidebar";
import { createClient } from "@/lib/supabase/server";
import {
  getConversationsWorkspace as getCoreConversationsWorkspace,
  type ConversationWorkspaceResult,
} from "@/lib/conversations-data-core";

export type {
  ConversationWorkspaceMessage,
  ConversationAssignmentCandidate,
  ConversationWorkspaceTeam,
  ConversationWorkspaceSelected,
  ConversationWorkspaceMetrics,
  ConversationWorkspaceResult,
} from "@/lib/conversations-data-core";

type PersonLeadLink = {
  lead_id?: string | null;
  person_id?: string | null;
};

const priorityRank: Record<ConversationPriority, number> = {
  urgent: 4,
  high: 3,
  normal: 2,
  waiting: 1,
};

export async function getConversationsWorkspace(
  requestedLeadId?: string,
): Promise<ConversationWorkspaceResult> {
  const workspace = await getCoreConversationsWorkspace(requestedLeadId);
  const baseRows = workspace.conversationSummary;

  if (baseRows.length === 0) {
    return workspace;
  }

  if (baseRows.length === 1) {
    return {
      ...workspace,
      conversationSummary: [withSingleOpportunityIdentity(baseRows[0])],
    };
  }

  try {
    const supabase = await createClient();
    const leadIds = baseRows.map((row) => row.id);
    const { data, error } = await supabase
      .from("person_leads")
      .select("lead_id,person_id")
      .in("lead_id", leadIds);

    if (error) {
      throw new Error(error.message);
    }

    const groupedRows = groupInboxRowsByPerson(
      baseRows,
      (data ?? []) as PersonLeadLink[],
      workspace.selectedId,
      workspace.team.currentUserId,
    );

    return {
      ...workspace,
      conversationSummary: groupedRows,
      metrics: {
        ...workspace.metrics,
        activeConversations: groupedRows.length,
      },
    };
  } catch (error) {
    console.warn("[conversations] Contact grouping unavailable; using Lead-level queue", {
      message: error instanceof Error ? error.message : String(error),
    });

    return {
      ...workspace,
      conversationSummary: baseRows.map(withSingleOpportunityIdentity),
    };
  }
}

function groupInboxRowsByPerson(
  rows: ConversationLeadSummary[],
  links: PersonLeadLink[],
  selectedLeadId?: string,
  currentUserId?: string | null,
) {
  const personByLead = new Map<string, string>();

  for (const link of links) {
    const leadId = cleanId(link.lead_id);
    const personId = cleanId(link.person_id);
    if (leadId && personId) personByLead.set(leadId, personId);
  }

  const groups = new Map<string, ConversationLeadSummary[]>();
  const order: string[] = [];

  for (const row of rows) {
    const personId = personByLead.get(row.id);
    const key = personId ? `person:${personId}` : `lead:${row.id}`;

    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }

    groups.get(key)?.push(row);
  }

  return order.flatMap((key) => {
    const group = groups.get(key) ?? [];
    if (group.length === 0) return [];

    const personId = key.startsWith("person:") ? key.slice("person:".length) : null;
    return [
      mergeContactGroup(group, personId, selectedLeadId, currentUserId ?? null),
    ];
  });
}

function mergeContactGroup(
  group: ConversationLeadSummary[],
  personId: string | null,
  selectedLeadId?: string,
  currentUserId?: string | null,
): ConversationLeadSummary {
  const selected = selectedLeadId
    ? group.find((row) => row.id === selectedLeadId)
    : undefined;

  const representative =
    selected ??
    [...group].sort((left, right) =>
      compareRepresentative(left, right, currentUserId ?? null),
    )[0];

  const relatedLeadIds = group.map((row) => row.id);
  const newestContact = newestTimestamp(group.map((row) => row.lastContactedAt));
  const waitingSince = oldestTimestamp(
    group
      .filter((row) => row.needsReply || row.needsFirstContact)
      .map((row) => row.waitingSince),
  );
  const activeSnoozes = group
    .map((row) => row.snoozedUntil)
    .filter((value): value is string => isFuture(value));
  const allSnoozed = activeSnoozes.length === group.length;

  const distinctOwners = Array.from(
    new Set(group.map((row) => row.ownerUserId).filter(Boolean)),
  );
  const currentUserOwned = currentUserId
    ? group.find((row) => row.ownerUserId === currentUserId)
    : undefined;
  const ownerRepresentative =
    distinctOwners.length > 1 && currentUserOwned ? currentUserOwned : representative;

  return {
    ...representative,
    personId,
    opportunityCount: group.length,
    relatedLeadIds,
    lastContactedAt: newestContact ?? representative.lastContactedAt,
    unread: group.some((row) => row.unread),
    needsReply: group.some((row) => row.needsReply),
    needsFirstContact:
      !group.some((row) => row.needsReply) &&
      group.some((row) => row.needsFirstContact),
    priority: highestPriority(group.map((row) => row.priority)),
    waitingSince,
    ownerUserId: ownerRepresentative.ownerUserId,
    ownerName:
      distinctOwners.length > 1
        ? "Multiple owners"
        : ownerRepresentative.ownerName,
    snoozedUntil: allSnoozed
      ? oldestTimestamp(activeSnoozes) ?? representative.snoozedUntil
      : null,
  };
}

function compareRepresentative(
  left: ConversationLeadSummary,
  right: ConversationLeadSummary,
  currentUserId: string | null,
) {
  const leftMine = currentUserId && left.ownerUserId === currentUserId ? 1 : 0;
  const rightMine = currentUserId && right.ownerUserId === currentUserId ? 1 : 0;
  if (leftMine !== rightMine) return rightMine - leftMine;

  const leftAttention = left.needsReply ? 3 : left.needsFirstContact ? 2 : left.unread ? 1 : 0;
  const rightAttention = right.needsReply ? 3 : right.needsFirstContact ? 2 : right.unread ? 1 : 0;
  if (leftAttention !== rightAttention) return rightAttention - leftAttention;

  const priorityDifference = priorityRank[right.priority] - priorityRank[left.priority];
  if (priorityDifference !== 0) return priorityDifference;

  return timestampValue(right.lastContactedAt) - timestampValue(left.lastContactedAt);
}

function highestPriority(values: ConversationPriority[]): ConversationPriority {
  return values.reduce<ConversationPriority>(
    (best, value) => (priorityRank[value] > priorityRank[best] ? value : best),
    "waiting",
  );
}

function withSingleOpportunityIdentity(
  row: ConversationLeadSummary,
): ConversationLeadSummary {
  return {
    ...row,
    personId: row.personId ?? null,
    opportunityCount: row.opportunityCount ?? 1,
    relatedLeadIds: row.relatedLeadIds ?? [row.id],
  };
}

function newestTimestamp(values: Array<string | null | undefined>) {
  return pickTimestamp(values, "newest");
}

function oldestTimestamp(values: Array<string | null | undefined>) {
  return pickTimestamp(values, "oldest");
}

function pickTimestamp(
  values: Array<string | null | undefined>,
  mode: "newest" | "oldest",
) {
  const valid = values
    .filter((value): value is string => Boolean(value))
    .map((value) => ({ value, time: timestampValue(value) }))
    .filter((entry) => Number.isFinite(entry.time));

  if (valid.length === 0) return null;

  valid.sort((left, right) =>
    mode === "newest" ? right.time - left.time : left.time - right.time,
  );

  return valid[0]?.value ?? null;
}

function isFuture(value: string | null | undefined) {
  if (!value) return false;
  const time = timestampValue(value);
  return Number.isFinite(time) && time > Date.now();
}

function timestampValue(value: string | null | undefined) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function cleanId(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
