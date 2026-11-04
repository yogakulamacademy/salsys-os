import "server-only";

import type { ConversationLeadSummary } from "@/components/conversations-sidebar";
import { createClient } from "@/lib/supabase/server";

export type InboxSort = "created_desc" | "activity_desc";
export type InboxScope = "team" | "mine" | "unassigned" | `owner:${string}`;
export type InboxFilter = "all" | "reply" | "unread" | "snoozed";
export type InboxChannel = "all" | "website" | "instagram" | "whatsapp";
export type InboxPriority = "all" | "urgent" | "high" | "normal" | "waiting";

export type InboxQuery = {
  page?: string;
  q?: string;
  sort?: string;
  scope?: string;
  filter?: string;
  channel?: string;
  priority?: string;
};

export type InboxPageCounts = {
  team: number;
  mine: number;
  unassigned: number;
  reply: number;
  unread: number;
  snoozed: number;
};

export type InboxPage = {
  rows: ConversationLeadSummary[];
  page: number;
  pageSize: number;
  totalMatching: number;
  counts: InboxPageCounts;
  owners: Array<{id: string; name: string}>;
  sort: InboxSort;
  scope: InboxScope;
  filter: InboxFilter;
  channel: InboxChannel;
  priority: InboxPriority;
  search: string;
};

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
  const sort = choice(query.sort, ["created_desc", "activity_desc"] as const, "created_desc");
  const scope = query.scope?.startsWith("owner:") &&
    /^owner:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(query.scope)
    ? query.scope.toLowerCase() as InboxScope
    : choice(query.scope, ["team", "mine", "unassigned"] as const, defaultScope);
  const filter = choice(query.filter, ["all", "reply", "unread", "snoozed"] as const, "all");
  const channel = choice(query.channel, ["all", "website", "instagram", "whatsapp"] as const, "all");
  const priority = choice(query.priority, ["all", "urgent", "high", "normal", "waiting"] as const, "all");
  const search = (query.q || "").trim().slice(0, 120);

  const supabase = await createClient();
  const { data, error } = await (supabase as any).rpc("get_current_conversations_page_v1", {
    p_page: page,
    p_page_size: 50,
    p_search: search,
    p_sort: sort,
    p_scope: scope,
    p_filter: filter,
    p_channel: channel,
    p_priority: priority,
  });

  if (error) throw new Error(`Unable to load full Inbox page: ${error.message}`);
  if (!data || typeof data !== "object" || !Array.isArray(data.inbox)) {
    throw new Error("Inbox page returned an invalid payload");
  }

  const counts = data.counts || {};
  return {
    rows: data.inbox as ConversationLeadSummary[],
    page: numberOrZero(data.page) || page,
    pageSize: numberOrZero(data.pageSize) || 50,
    totalMatching: numberOrZero(data.totalMatching),
    owners: Array.isArray(data.owners) ? data.owners.filter((owner: unknown) => Boolean(owner && typeof owner === "object" && typeof (owner as {id?: unknown}).id === "string" && typeof (owner as {name?: unknown}).name === "string")) : [],
    counts: {
      team: numberOrZero(counts.team),
      mine: numberOrZero(counts.mine),
      unassigned: numberOrZero(counts.unassigned),
      reply: numberOrZero(counts.reply),
      unread: numberOrZero(counts.unread),
      snoozed: numberOrZero(counts.snoozed),
    },
    sort, scope, filter, channel, priority, search,
  };
}
