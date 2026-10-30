import type { ConversationLeadSummary, ConversationPriority } from "@/components/conversations-sidebar";
import { createClient } from "@/lib/supabase/server";

type PersonLeadLink = {
  person_id: string;
  lead_id: string;
};

type GroupedSummary = ConversationLeadSummary & {
  personId?: string;
  opportunityCount?: number;
  linkedOpportunityIds?: string[];
};

const PRIORITY_WEIGHT: Record<ConversationPriority, number> = {
  urgent: 4,
  high: 3,
  normal: 2,
  waiting: 1,
};

/**
 * Collapse the already-authorized Lead-centric Inbox into one row per Contact.
 *
 * Important boundaries:
 * - The existing Conversations RPC remains the authority for access, attention,
 *   ownership and provider-safe thread state.
 * - person_leads is used only to group rows that the caller can already see.
 * - The returned row id is always a real Lead/Opportunity id so current URLs,
 *   composer actions and thread reads continue to work unchanged.
 * - If identity enrichment is unavailable, the Inbox fails soft and keeps the
 *   original Lead-centric queue instead of blocking messaging.
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
  if (!organizationId || summaries.length < 2) return summaries;

  const authorizedLeadIds = new Set(summaries.map((summary) => summary.id));
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("person_leads")
    .select("person_id,lead_id")
    .eq("organization_id", organizationId);

  if (error) {
    console.warn("[conversations] Contact grouping unavailable; using Lead queue:", error.message);
    return summaries;
  }

  const links = ((data ?? []) as PersonLeadLink[]).filter((link) =>
    authorizedLeadIds.has(link.lead_id),
  );
  if (!links.length) return summaries;

  const personByLead = new Map(links.map((link) => [link.lead_id, link.person_id]));
  const groups = new Map<string, ConversationLeadSummary[]>();
  const groupOrder: string[] = [];

  for (const summary of summaries) {
    const personId = personByLead.get(summary.id);
    // Unlinked Opportunities remain independent. We never guess identity by name.
    const groupKey = personId ? `person:${personId}` : `lead:${summary.id}`;
    if (!groups.has(groupKey)) {
      groups.set(groupKey, []);
      groupOrder.push(groupKey);
    }
    groups.get(groupKey)!.push(summary);
  }

  return groupOrder.flatMap((groupKey) => {
    const members = groups.get(groupKey) ?? [];
    if (!members.length) return [];
    if (members.length === 1) {
      const only = members[0];
      const personId = personByLead.get(only.id);
      return [{
        ...only,
        personId,
        opportunityCount: 1,
        linkedOpportunityIds: [only.id],
      }];
    }

    const selectedMember = selectedLeadId
      ? members.find((member) => member.id === selectedLeadId)
      : undefined;
    const representative = selectedMember ?? [...members].sort(compareRepresentative)[0];
    const needsReply = members.some((member) => member.needsReply);
    const needsFirstContact = !needsReply && members.some((member) => member.needsFirstContact);
    const unread = members.some((member) => member.unread);
    const priority = members.reduce<ConversationPriority>(
      (best, member) =>
        PRIORITY_WEIGHT[member.priority] > PRIORITY_WEIGHT[best] ? member.priority : best,
      representative.priority,
    );

    const waitingSince = earliestDate(
      members
        .filter((member) => member.needsReply || member.needsFirstContact)
        .map((member) => member.waitingSince),
    );
    const lastContactedAt = latestDate(members.map((member) => member.lastContactedAt));
    const allSnoozed = members.every((member) => isFuture(member.snoozedUntil));
    const snoozedUntil = allSnoozed
      ? earliestDate(members.map((member) => member.snoozedUntil))
      : null;
    const otherOpportunityCount = members.length - 1;
    const baseCourse = representative.course || "Course not selected";

    return [{
      ...representative,
      course:
        otherOpportunityCount > 0
          ? `${baseCourse} · +${otherOpportunityCount} ${otherOpportunityCount === 1 ? "opportunity" : "opportunities"}`
          : baseCourse,
      unread,
      needsReply,
      needsFirstContact,
      priority,
      waitingSince,
      lastContactedAt,
      snoozedUntil,
      personId: personByLead.get(representative.id),
      opportunityCount: members.length,
      linkedOpportunityIds: members.map((member) => member.id),
    }];
  });
}

function compareRepresentative(a: ConversationLeadSummary, b: ConversationLeadSummary) {
  const aAttention = a.needsReply || a.needsFirstContact ? 1 : 0;
  const bAttention = b.needsReply || b.needsFirstContact ? 1 : 0;
  if (aAttention !== bAttention) return bAttention - aAttention;

  const priorityDelta = PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority];
  if (priorityDelta !== 0) return priorityDelta;

  const aTime = toTime(a.lastContactedAt);
  const bTime = toTime(b.lastContactedAt);
  return bTime - aTime;
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
