import "server-only";

import type { ConversationLeadSummary } from "@/components/conversations-sidebar";
import { createClient } from "@/lib/supabase/server";

export type InboxSort = "created_desc" | "activity_desc";
export type InboxScope = "team" | "mine" | "unassigned" | `owner:${string}`;
export type InboxFilter = "all" | "reply" | "unread" | "snoozed" | "waiting" | "older";
export type InboxChannel = "all" | "website" | "instagram" | "whatsapp";
export type InboxPriority = "all" | "urgent" | "high" | "normal" | "waiting";
import { INBOX_TOPICS, type InboxTopic } from "@/lib/inbox-topics";
import { isRecentWait } from "@/lib/inbox-waiting";
export type { InboxTopic };

export type InboxQuery = {
  page?: string;
  q?: string;
  sort?: string;
  scope?: string;
  filter?: string;
  channel?: string;
  priority?: string;
  topic?: string;
  /** "1" = rows only for a further page of an ordinary tab: skip the Waiting
   *  scan (its counts are already on screen). Keeps "load more" cheap. */
  light?: string;
};

export type InboxPageCounts = {
  scope: number;
  team: number;
  mine: number;
  unassigned: number;
  reply: number;
  unread: number;
  snoozed: number;
  /** Wrote in the last 7 days, no reply yet (owner request, 20 Nov 2026). */
  waiting: number;
  /** Waiting for a reply for more than 7 days. */
  older: number;
};

export type InboxChannelCounts = { all: number; whatsapp: number; instagram: number; website: number };

export type InboxPage = {
  rows: ConversationLeadSummary[];
  page: number;
  pageSize: number;
  totalMatching: number;
  counts: InboxPageCounts;
  /** Null when the v2 inbox function is not deployed yet (v1 fallback). */
  channelCounts: InboxChannelCounts | null;
  topicCounts: Partial<Record<InboxTopic, number>> | null;
  topic: InboxTopic;
  owners: Array<{id: string; name: string}>;
  sort: InboxSort;
  scope: InboxScope;
  filter: InboxFilter;
  channel: InboxChannel;
  priority: InboxPriority;
  search: string;
};

// Missing-migration compatibility is the only condition permitted to use the
// bounded legacy reader. Other RPC failures must fail closed instead.
export class InboxPaginationNotDeployedError extends Error {
  constructor() {
    super("Full-dataset Inbox migration is not yet installed");
    this.name = "InboxPaginationNotDeployedError";
  }
}

// A statement timeout is a transient database performance failure, not
// evidence of a missing RPC. It gets an explicit, user-visible compatibility
// fallback so that staff can still open and answer existing conversations.
export class InboxPaginationTimedOutError extends Error {
  constructor() {
    super("Full-dataset Inbox query exceeded the database statement timeout");
    this.name = "InboxPaginationTimedOutError";
  }
}

function choice<T extends string>(value: unknown, choices: readonly T[], fallback: T): T {
  return typeof value === "string" && choices.includes(value as T)
    ? (value as T)
    : fallback;
}

function numberOrZero(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? num : 0;
}

export async function getInboxPage(
  query: InboxQuery,
  defaultScope: InboxScope,
): Promise<InboxPage> {
  const requestedPage = Number(query.page || 1);
  const page = Number.isSafeInteger(requestedPage)
    ? Math.min(Math.max(1, requestedPage), 100000)
    : 1;
  // An older conversation with a new customer message belongs at the top
  // of the inbox. Preserve explicit created_desc as an optional user sort.
  const sort = choice(query.sort, ["created_desc", "activity_desc"] as const, "activity_desc");
  const scope = query.scope?.startsWith("owner:") &&
    /^owner:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(query.scope)
    ? query.scope.toLowerCase() as InboxScope
    : choice(query.scope, ["team", "mine", "unassigned"] as const, defaultScope);
  // All, newest activity first, is the default view (owner request, 25 Nov 2026).
  const filter = choice(query.filter, ["all", "reply", "unread", "snoozed", "waiting", "older"] as const, "all");
  const channel = choice(query.channel, ["all", "website", "instagram", "whatsapp"] as const, "all");
  const priority = choice(query.priority, ["all", "urgent", "high", "normal", "waiting"] as const, "all");
  const search = (query.q || "").trim().slice(0, 120);
  const topic = choice(query.topic, ["all", ...INBOX_TOPICS, "other"] as const, "all") as InboxTopic;

  const supabase = await createClient();
  let usedV2 = true;
  async function callPage(p: { page: number; pageSize: number; filter: string; channel: string; sort: string }) {
    const args = {
      p_page: p.page,
      p_page_size: p.pageSize,
      p_search: search,
      p_sort: p.sort,
      p_scope: scope,
      p_filter: p.filter,
      p_channel: p.channel,
      p_priority: priority,
    };
    // v2 adds topics and channel counts; fall back to v1 only when v2 is not deployed.
    let { data, error } = usedV2
      ? await (supabase as any).rpc("get_current_conversations_page_v2", { ...args, p_topic: topic })
      : await (supabase as any).rpc("get_current_conversations_page_v1", args);
    if (error && usedV2 && (error.code === "PGRST202" || error.code === "42883")) {
      usedV2 = false;
      ({ data, error } = await (supabase as any).rpc("get_current_conversations_page_v1", args));
    }

    if (error) {
      if (error.code === "PGRST202" || error.code === "42883") {
        throw new InboxPaginationNotDeployedError();
      }
      // PostgreSQL 57014 can also mean a manually canceled query. Only recover
      // the known statement_timeout case; do not suppress authorization failures.
      if (error.code === "57014" && /canceling statement due to statement timeout/i.test(error.message ?? "")) {
        throw new InboxPaginationTimedOutError();
      }
      throw new Error(`Unable to load full Inbox page: ${error.message}`);
    }
    if (!data || typeof data !== "object" || !Array.isArray(data.inbox)) {
      throw new Error("Inbox page returned an invalid payload");
    }
    return data;
  }

  // One call per Inbox view (25 Nov 2026). The database works out "waiting
  // this week" (needs a reply, wrote in the last 7 days) and "older" itself,
  // and returns this week's counts per channel. The app used to read up to
  // three extra 100-row pages on every view to count them, which overloaded
  // the database when realtime refreshed the Inbox.
  const now = Date.now();
  let data: any = await callPage({ page, pageSize: 50, filter, channel, sort });
  let rows: ConversationLeadSummary[] = data.inbox as ConversationLeadSummary[];
  let totalMatching = numberOrZero(data.totalMatching);
  const pageSize = 50;
  const week = data.waitingWeek && typeof data.waitingWeek === "object" ? data.waitingWeek : null;
  let waitingAll: ConversationLeadSummary[] = [];
  if (!week) {
    // Engine without waitingWeek (older database): fall back to the first page of needs-a-reply.
    const reply = filter === "reply" && channel === "all" ? data : await callPage({ page: 1, pageSize: 100, filter: "reply", channel: "all", sort: "activity_desc" });
    waitingAll = (reply.inbox as ConversationLeadSummary[]).filter((r) => isRecentWait(r.waitingSince, now));
    if (filter === "waiting") { rows = channel === "all" ? waitingAll : waitingAll.filter((r) => r.currentContactChannel === channel); totalMatching = rows.length; data = { ...reply, ...data }; }
  }
  const waitingCount = week ? numberOrZero(week.all) : waitingAll.length;

  const counts = data.counts || {};
  const channelCounts = filter === "waiting" && usedV2 && week
    ? {
        all: numberOrZero(week.all),
        whatsapp: numberOrZero(week.whatsapp),
        instagram: numberOrZero(week.instagram),
        website: numberOrZero(week.website),
      }
    : null;
  return {
    rows,
    page: numberOrZero(data.page) || page,
    pageSize: numberOrZero(data.pageSize) || pageSize,
    totalMatching,
    owners: Array.isArray(data.owners) ? data.owners.filter((owner: unknown) => Boolean(owner && typeof owner === "object" && typeof (owner as {id?: unknown}).id === "string" && typeof (owner as {name?: unknown}).name === "string")) : [],
    counts: {
      scope: numberOrZero(counts.scope),
      team: numberOrZero(counts.team),
      mine: numberOrZero(counts.mine),
      unassigned: numberOrZero(counts.unassigned),
      reply: numberOrZero(counts.reply),
      unread: numberOrZero(counts.unread),
      snoozed: numberOrZero(counts.snoozed),
      waiting: waitingCount,
      older: Math.max(0, numberOrZero(counts.reply) - waitingCount),
    },
    channelCounts: channelCounts ?? (usedV2 && data.channels && typeof data.channels === "object"
      ? {
          all: numberOrZero(data.channels.all),
          whatsapp: numberOrZero(data.channels.whatsapp),
          instagram: numberOrZero(data.channels.instagram),
          website: numberOrZero(data.channels.website),
        }
      : null),
    topicCounts: usedV2 && data.topics && typeof data.topics === "object"
      ? Object.fromEntries(Object.entries(data.topics as Record<string, unknown>).map(([k, v]) => [k, numberOrZero(v)])) as Partial<Record<InboxTopic, number>>
      : null,
    topic: usedV2 ? topic : "all",
    sort, scope, filter, channel, priority, search,
  };
}
