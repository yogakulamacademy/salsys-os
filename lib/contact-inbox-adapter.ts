import type {
  ConversationLeadSummary,
  ConversationPriority,
} from "@/components/conversations-sidebar";
import { createClient } from "@/lib/supabase/server";

type PersonLeadLink = {
  person_id: string;
  lead_id: string;
};

type GroupedSummary = ConversationLeadSummary;

const PRIORITY_WEIGHT: Record<ConversationPriority, number> = {
  urgent: 4,
  high: 3,
  normal: 2,
  waiting: 1,
};

/**
 * Legacy-compatible Contact grouping helper.
 *
 * The primary Inbox path now groups in lib/conversations-data.ts. This helper
 * remains type-compatible for any secondary caller and preserves the same
 * deterministic identity boundary: person_leads only, never fuzzy name match.
 */
export async function groupConversationQueueByContact({
  organizationId,
  summaries,
  selectedLeadId,
}: {
  organizationId: string | null;
  summaries: ConversationLeadSummary[];
  selectedLeadId?: string;
}): Promise<GroupedSummary[]> {
  if (!organizationId || summaries.length < 2) {
    return summaries.map(withSingleOpportunityIdentity);
  }

  const authorizedLeadIds = new Set(summaries.map((summary) => summary.id));
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("person_leads")
    .select("person_id,lead_id")
    .eq("organization_id", organizationId);

  if (error) {
    console.warn(
      "[conversations] Contact grouping unavailable; using Lead queue:",
      error.message,
    );
    return summaries.map(withSingleOpportunityIdentity);
  }

  const links = ((data ?? []) as PersonLeadLink[]).filter((link) =>
    authorizedLeadIds.has(link.lead_id),
  );
  if (!links.length) return summaries.map(withSingleOpportunityIdentity);

  const personByLead = new Map(links.map((link) => [link.lead_id, link.person_id]));
  const groups = new Map<string, ConversationLeadSummary[]>();
  const groupOrder: string[] = [];

  for (const summary of summaries) {
    const personId = personByLead.get(summary.id);
    const groupKey = personId ? `person:${personId}` : `lead:${summary.id}`;
    if (!groups.has(groupKey)) {
      groups.set(groupKey, []);
      groupOrder.push(groupKey);
    }
    groups.get(groupKey)?.push(summary);
  }

  return groupOrder.flatMap((groupKey) => {
    const members = groups.get(groupKey) ?? [];
    if (!members.length) return [];

    if (members.length === 1) {
      const only = members[0];
      return [
        {
          ...only,
          personId: personByLead.get(only.id) ?? null,
          opportunityCount: 1,
          relatedLeadIds: [only.id],
        },
      ];
    }

    const selectedMember = selectedLeadId
      ? members.find((member) => member.id === selectedLeadId)
      : undefined;
    const representative = selectedMember ?? [...members].sort(compareRepresentative)[0];
    const needsReply = members.some((member) => member.needsReply);
    const needsFirstContact =
      !needsReply && members.some((member) => member.needsFirstContact);
    const unread = members.some((member) => member.unread);
    const priority = members.reduce<ConversationPriority>(
      (best, member) =>
        PRIORITY_WEIGHT[member.priority] > PRIORITY_WEIGHT[best]
          ? member.priority
          : best,
      representative.priority,
    );

    const waitingSince = earliestDate(
      members
        .filter((member) => member.needsReply || member.needsFirstContact)
        .map((member) => member.waitingSince),
    );
    const lastContactedAt = latestDate(
      members.map((member) => member.lastContactedAt),
    );
    const allSnoozed = members.every((member) => isFuture(member.snoozedUntil));
    const snoozedUntil = allSnoozed
      ? earliestDate(members.map((member) => member.snoozedUntil))
      : null;

    return [
      {
        ...representative,
        unread,
        needsReply,
        needsFirstContact,
        priority,
        waitingSince,
        lastContactedAt,
        snoozedUntil,
        personId: personByLead.get(representative.id) ?? null,
        opportunityCount: members.length,
        relatedLeadIds: members.map((member) => member.id),
      },
    ];
  });
}

function withSingleOpportunityIdentity(
  summary: ConversationLeadSummary,
): ConversationLeadSummary {
  return {
    ...summary,
    personId: summary.personId ?? null,
    opportunityCount: summary.opportunityCount ?? 1,
    relatedLeadIds: summary.relatedLeadIds ?? [summary.id],
  };
}

function compareRepresentative(a: ConversationLeadSummary, b: ConversationLeadSummary) {
  const aAttention = a.needsReply || a.needsFirstContact ? 1 : 0;
  const bAttention = b.needsReply || b.needsFirstContact ? 1 : 0;
  if (aAttention !== bAttention) return bAttention - aAttention;

  const priorityDelta = PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority];
  if (priorityDelta !== 0) return priorityDelta;

  return toTime(b.lastContactedAt) - toTime(a.lastContactedAt);
}

function earliestDate(values: Array<string | null>) {
  const valid = values
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => toTime(a) - toTime(b));
  return valid[0] ?? null;
}

function latestDate(values: Array<string | null>) {
  const valid = values
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => toTime(b) - toTime(a));
  return valid[0] ?? null;
}

function toTime(value: string | null) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function isFuture(value: string | null) {
  return toTime(value) > Date.now();
}
