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
  // Waiting (this week) is the default view; the full list is one tap away.
  const filter = choice(query.filter, ["all", "reply", "unread", "snoozed", "waiting", "older"] as const, "waiting");
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

  // Waiting = needs a reply and wrote in the last 7 days. Needs-reply rows
  // come newest first, so read them until they turn older than a week (all
  // channels, so the channel chips can show this week's counts).
  const now = Date.now();
  const waitingAll: ConversationLeadSummary[] = [];
  let replyAllPayload: any = null;
  const skipWaitingScan = query.light === "1" && filter !== "waiting" && filter !== "older";
  for (let p = 1; p <= (skipWaitingScan ? 0 : 3); p += 1) {
    const payload = await callPage({ page: p, pageSize: 100, filter: "reply", channel: "all", sort: "activity_desc" });
    if (p === 1) replyAllPayload = payload;
    const rows = payload.inbox as ConversationLeadSummary[];
    const recent = rows.filter((r) => isRecentWait(r.waitingSince, now));
    waitingAll.push(...recent);
    if (recent.length < rows.length || rows.length < 100) break;
  }
  const waitingFor = (ch: string) => ch === "all" ? waitingAll : waitingAll.filter((r) => r.currentContactChannel === ch);

  let data: any;
  let rows: ConversationLeadSummary[];
  let totalMatching: number;
  let pageSize = 50;
  if (filter === "waiting") {
    data = replyAllPayload;
    rows = waitingFor(channel);
    totalMatching = rows.length;
    pageSize = Math.max(50, rows.length);
  } else if (filter === "older") {
    // Older needs-reply rows sit after this week's in the same order.
    const skip = waitingFor(channel).length;
    const start = skip + (page - 1) * 50;
    const rpcPage = Math.floor(start / 100) + 1;
    const first = await callPage({ page: rpcPage, pageSize: 100, filter: "reply", channel, sort: "activity_desc" });
    let pool = first.inbox as ConversationLeadSummary[];
    const offset = start - (rpcPage - 1) * 100;
    if (offset + 50 > pool.length && pool.length === 100) {
      const next = await callPage({ page: rpcPage + 1, pageSize: 100, filter: "reply", channel, sort: "activity_desc" });
      pool = pool.concat(next.inbox as ConversationLeadSummary[]);
    }
    data = first;
    rows = pool.slice(offset, offset + 50).filter((r) => !isRecentWait(r.waitingSince, now));
    totalMatching = Math.max(0, numberOrZero(first.totalMatching) - skip);
  } else {
    data = await callPage({ page, pageSize: 50, filter, channel, sort });
    rows = data.inbox as ConversationLeadSummary[];
    totalMatching = numberOrZero(data.totalMatching);
  }

  const counts = data.counts || {};
  const waitingCount = waitingAll.length;
  const channelCounts = filter === "waiting" && usedV2
    ? {
        all: waitingAll.length,
        whatsapp: waitingFor("whatsapp").length,
        instagram: waitingFor("instagram").length,
        website: waitingFor("website").length,
      }
    : null;
  return {
    rows,
    page: filter === "waiting" ? 1 : numberOrZero(data.page) || page,
    pageSize: filter === "waiting" ? pageSize : numberOrZero(data.pageSize) || 50,
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
