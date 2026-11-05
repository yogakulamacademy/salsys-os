/**
 * Minimal client-safe shape for read-only Instagram Graph history previews.
 * Provider summaries are advisory; malformed / over-broad payloads are unknown.
 * Never expose provider message bodies or account identifiers to the UI.
 */
export type InstagramHistoryPreview = {
  conversationsScanned: number;
  conversationsMatched: number;
  messagesSeen: number;
  messagesSkipped: number;
  hasMore: boolean;
};

const MAX_PREVIEW_CONVERSATIONS = 1;
const MAX_PREVIEW_MESSAGES = 20;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid Instagram history preview.');
  }
  return value as Record<string, unknown>;
}

function count(value: unknown, maximum: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) ||
      value < 0 || value > maximum) {
    throw new Error('Invalid Instagram history preview count.');
  }
  return value;
}

/**
 * Fail closed on an accidental import, client-side response contamination,
 * or a provider response outside the explicit bounded-preview contract.
 */
export function parseInstagramHistoryPreview(value: unknown): InstagramHistoryPreview {
  const payload = record(value);
  if (payload.ok !== true || payload.dryRun !== true ||
      payload.customerMessageSent !== false ||
      typeof payload.hasMore !== 'boolean') {
    throw new Error('Instagram history preview was not confirmed read-only.');
  }
  const conversationsScanned = count(payload.conversationsScanned, MAX_PREVIEW_CONVERSATIONS);
  const conversationsMatched = count(payload.conversationsMatched, MAX_PREVIEW_CONVERSATIONS);
  const messagesSeen = count(payload.messagesSeen, MAX_PREVIEW_MESSAGES);
  const messagesSkipped = count(payload.messagesSkipped, MAX_PREVIEW_MESSAGES + MAX_PREVIEW_CONVERSATIONS);
  if (conversationsMatched > conversationsScanned ||
      messagesSkipped > messagesSeen + MAX_PREVIEW_CONVERSATIONS ||
      count(payload.messagesImported, 0) !== 0 ||
      count(payload.messagesAlreadyPresent, 0) !== 0) {
    throw new Error('Instagram history preview contains inconsistent counts.');
  }
  const expected = [
    'ok', 'dryRun', 'customerMessageSent', 'conversationsScanned',
    'conversationsMatched', 'messagesSeen', 'messagesSkipped',
    'messagesImported', 'messagesAlreadyPresent', 'hasMore',
  ];
  if (Object.keys(payload).some(key => !expected.includes(key))) {
    throw new Error('Instagram history preview contains unexpected details.');
  }
  return { conversationsScanned, conversationsMatched, messagesSeen, messagesSkipped, hasMore: payload.hasMore };
}
