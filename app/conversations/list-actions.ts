'use server';

import { getConversationsWorkspace } from '@/lib/conversations-data';
import type { InboxQuery } from '@/lib/conversations-page-data';

/**
 * Loads one page of the Inbox list (50 rows, by offset) without re-rendering
 * the whole Inbox page (owner request, 20 Nov 2026). Switching tabs, chips or
 * owner keeps the open chat; scrolling to the end loads the next 50.
 * Same RLS-scoped reader as the page; nothing here takes an organization id.
 */
export async function loadInboxListAction(query: InboxQuery) {
  const clean: InboxQuery = {};
  for (const key of ['page', 'q', 'sort', 'scope', 'filter', 'channel', 'priority', 'topic', 'light'] as const) {
    const value = query?.[key];
    if (typeof value === 'string' && value.length <= 200) clean[key] = value;
  }
  const workspace = await getConversationsWorkspace(undefined, clean);
  return { rows: workspace.conversationSummary, pagination: workspace.pagination ?? null };
}
