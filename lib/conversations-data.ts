import "server-only";

import type {
  ConversationLeadSummary,
  ConversationPriority,
} from "@/components/conversations-sidebar";
import { createClient } from "@/lib/supabase/server";
import {
  getInboxPage,
  InboxPaginationNotDeployedError,
  type InboxPage,
  type InboxQuery,
} from "@/lib/conversations-page-data";
import { isMockMode } from "@/lib/data";
import { requireCurrentOrganizationId } from "@/lib/workspace";
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

export type ConversationWorkspaceEvidence = {
  workspaceSource: "canonical_rpc" | "legacy_compatibility";
  contactGrouping: "person" | "lead_fallback" | "not_applicable";
  warnings: string[];
  inboxResolutionAvailable: boolean;
};

export type ConversationWorkspaceView = ConversationWorkspaceResult & {
  evidence: ConversationWorkspaceEvidence;
  pagination?: Omit<InboxPage, "rows">;
};

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

function baseEvidence(workspace: ConversationWorkspaceResult): ConversationWorkspaceEvidence {
  return workspace.optimized
    ? {
        workspaceSource: "canonical_rpc",
        contactGrouping: "not_applicable",
        warnings: [],
        inboxResolutionAvailable: false,
      }
    : {
        workspaceSource: "legacy_compatibility",
        contactGrouping: "not_applicable",
        inboxResolutionAvailable: false,
        warnings: [
          "The canonical Conversations read model is unavailable. This inbox is using the compatibility read path, so queue counts and assignment controls may differ until canonical evidence recovers.",
        ],
      };
}

export async function getConversationsWorkspace(
  requestedLeadId?: string,
  query: InboxQuery = {},
): Promise<ConversationWorkspaceView> {
  const mock = isMockMode();
  let workspace = await getCoreConversationsWorkspace(requestedLeadId, !mock);
  let fullPage: InboxPage | null = null;
  let pagingWarning: string | null = null;
  if (!mock) {
    try {
      fullPage = await getInboxPage(
        query,
        workspace.team.currentUserId && !workspace.team.canManageAssignments ? "mine" : "team",
      );
    } catch (error) {
      if (!(error instanceof InboxPaginationNotDeployedError)) throw error;
      // On a Vercel main-branch deploy ahead of a reviewed SQL migration,
      // re-read the complete legacy candidate queue. Never render its 1-row
      // selected-thread lookup as though it were the full Inbox.
      workspace = await getCoreConversationsWorkspace(requestedLeadId, false);
      pagingWarning = "Full-dataset Inbox pagination is not yet available. Showing the legacy limited queue until the database migration is installed.";
    }
  }
  const resolution = await loadInboxResolutionState(fullPage?.rows ?? workspace.conversationSummary);
  const baseRows = resolution.rows;
  const pagination = fullPage
    ? (({ rows: _rows, ...meta }) => meta)(fullPage)
    : undefined;
  const pageWorkspace = {
    ...workspace,
    pagination,
    metrics: {
      ...workspace.metrics,
      activeConversations: fullPage?.totalMatching ?? workspace.metrics.activeConversations,
    },
  };
  const evidence: ConversationWorkspaceEvidence = {
    ...baseEvidence(workspace),
    inboxResolutionAvailable: resolution.available,
    warnings: [
      ...baseEvidence(workspace).warnings,
      ...(pagingWarning ? [pagingWarning] : []),
      ...(resolution.warning ? [resolution.warning] : []),
    ],
  };

  if (baseRows.length === 0) {
    return {
      ...pageWorkspace,
      conversationSummary: baseRows,
      evidence,
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
      ...pageWorkspace,
      conversationSummary: groupedRows,
      metrics: {
        ...workspace.metrics,
        activeConversations: fullPage?.totalMatching ?? groupedRows.length,
      },
      evidence: {
        ...evidence,
        contactGrouping: "person",
      },
    };
  } catch (error) {
    console.warn("[conversations] Contact grouping unavailable; using Lead-level queue", {
      message: error instanceof Error ? error.message : String(error),
    });

    return {
      ...pageWorkspace,
      conversationSummary: baseRows.map(withSingleOpportunityIdentity),
      evidence: {
        ...evidence,
        contactGrouping: "lead_fallback",
        warnings: [
          ...evidence.warnings,
          "Contact identity grouping could not be verified. Inbox rows and headline counts are shown at Lead / Opportunity level instead of Contact level.",
        ],
      },
    };
  }
}


async function loadInboxResolutionState(rows: ConversationLeadSummary[]):Promise<{
  rows:ConversationLeadSummary[]; available:boolean; warning:string|null;
}> {
  if(isMockMode()) return {rows,available:false,warning:null};
  if(rows.length===0) return {rows,available:true,warning:null};
  try {
    const supabase=await createClient();
    const {data:{user},error:authError}=await supabase.auth.getUser();
    if(authError||!user) throw new Error('No authenticated inbox workspace');
    const org=await requireCurrentOrganizationId(supabase,user.id);
    const ids=rows.map(row=>row.id);
    const [resolutions,attention]=await Promise.all([
      supabase.from('lead_inbox_resolutions_v1')
        .select('lead_id,resolved_at').eq('organization_id',org).in('lead_id',ids),
      supabase.from('v_lead_inbox_attention')
        .select('lead_id,last_inbound_at').eq('organization_id',org).in('lead_id',ids),
    ]);
    if(resolutions.error||attention.error)
      throw new Error(resolutions.error?.message||attention.error?.message||'Unavailable');
    const byId=new Map((resolutions.data??[]).map(row=>[row.lead_id,row.resolved_at]));
    const lastInbound=new Map((attention.data??[]).map(row=>[row.lead_id,row.last_inbound_at]));
    return {available:true,warning:null,rows:rows.map(row=>{
      const doneAt=byId.get(row.id);
      const inbound=lastInbound.get(row.id);
      const resolved=Boolean(doneAt && (!inbound ||
        (Date.parse(inbound)<=Date.parse(doneAt))));
      return resolved ? {...row,resolved:true,needsReply:false,needsFirstContact:false,
        waitingSince:null} : {...row,resolved:false};
    })};
  } catch(error) {
    console.warn('[inbox] resolution status unavailable',error instanceof Error?error.message:'unknown');
    return {rows,available:false,
      warning:'Conversation resolution state could not be verified. Mark Done is unavailable; live reply attention is unchanged.'};
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
    resolved: group.every((row) => Boolean(row.resolved)),
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
