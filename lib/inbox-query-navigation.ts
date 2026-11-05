/**
 * Inbox navigation deliberately separates the queue context from the opened
 * conversation. A changed queue cannot keep displaying a thread selected
 * under the previous search/page/filter context.
 *
 * Pure URL builder: no browser navigation, messaging, reads, or CRM writes.
 */
const inboxFilters = new Set(["filter", "priority", "channel"]);
const staleDetailParams = ["lead", "notice", "error", "wamid"];

function inboxHref(params: URLSearchParams): string {
  const search = params.toString();
  return search ? `/conversations?${search}` : "/conversations";
}

export function nextInboxQueueHref(
  current: string,
  key: "q" | "page" | "sort" | "scope" | "filter" | "priority" | "channel",
  value: string,
  preservePage = false,
): string {
  const params = new URLSearchParams(current);

  // The opened conversation belongs to the previous queue view; do not keep
  // a hidden, unrelated thread open while search/page/scope results change.
  for (const name of staleDetailParams) params.delete(name);

  if (!value ||
      (key === "page" && value === "1") ||
      (key === "sort" && value === "created_desc") ||
      (key !== "scope" && inboxFilters.has(key) && value === "all")) {
    params.delete(key);
  } else {
    params.set(key, value);
  }
  if (!preservePage) params.delete("page");
  return inboxHref(params);
}

export function resetInboxQueueHref(current: string): string {
  const params = new URLSearchParams(current);
  for (const key of [
    "q", "page", "sort", "scope", "filter", "priority", "channel",
    ...staleDetailParams,
  ]) params.delete(key);
  return inboxHref(params);
}
