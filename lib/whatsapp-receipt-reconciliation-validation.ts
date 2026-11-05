export type WhatsAppReceiptReconciliation = {
  processedReceipts: number;
  processedWithMessage: number;
  processedWithoutMessage: number;
  processedWithLink: number;
  failedReceipts: number;
  failedWithRawEvidence: number;
  failedWithMessage: number;
  failedWithoutMessage: number;
  failedWithLink: number;
  oldestProcessedUnmatchedAt: string | null;
  oldestFailedUnmatchedAt: string | null;
  checkedAt: string;
};

const FIELDS = [
  'processedReceipts',
  'processedWithMessage',
  'processedWithoutMessage',
  'processedWithLink',
  'failedReceipts',
  'failedWithRawEvidence',
  'failedWithMessage',
  'failedWithoutMessage',
  'failedWithLink',
  'oldestProcessedUnmatchedAt',
  'oldestFailedUnmatchedAt',
  'checkedAt',
] as const;

function safeCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error('WhatsApp receipt reconciliation is unavailable.');
  }
  return value;
}

function safeTimestamp(value: unknown, nullable: boolean): string | null {
  if (nullable && value === null) return null;
  if (typeof value !== 'string' || value.length > 45 ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value) ||
      !Number.isFinite(Date.parse(value))) {
    throw new Error('WhatsApp receipt reconciliation has an invalid timestamp.');
  }
  return value;
}

/**
 * A strict metadata-only boundary for server-side service-role RPC output.
 * Rejects accidental row/payload/provider ID exposure before rendering.
 */
export function parseWhatsAppReceiptReconciliation(value: unknown):
  WhatsAppReceiptReconciliation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('WhatsApp receipt reconciliation is unavailable.');
  }
  const source = value as Record<string, unknown>;
  if (Object.keys(source).length !== FIELDS.length ||
      Object.keys(source).some(key => !(FIELDS as readonly string[]).includes(key))) {
    throw new Error('WhatsApp receipt reconciliation returned unexpected fields.');
  }
  const processedReceipts = safeCount(source.processedReceipts);
  const processedWithMessage = safeCount(source.processedWithMessage);
  const processedWithoutMessage = safeCount(source.processedWithoutMessage);
  const processedWithLink = safeCount(source.processedWithLink);
  const failedReceipts = safeCount(source.failedReceipts);
  const failedWithRawEvidence = safeCount(source.failedWithRawEvidence);
  const failedWithMessage = safeCount(source.failedWithMessage);
  const failedWithoutMessage = safeCount(source.failedWithoutMessage);
  const failedWithLink = safeCount(source.failedWithLink);
  const oldestProcessedUnmatchedAt = safeTimestamp(source.oldestProcessedUnmatchedAt, true);
  const oldestFailedUnmatchedAt = safeTimestamp(source.oldestFailedUnmatchedAt, true);
  const checkedAt = safeTimestamp(source.checkedAt, false);

  if (processedWithMessage + processedWithoutMessage !== processedReceipts ||
      failedWithMessage + failedWithoutMessage !== failedReceipts ||
      processedWithLink > processedReceipts || failedWithLink > failedReceipts ||
      failedWithRawEvidence > failedReceipts ||
      (processedWithoutMessage === 0) !== (oldestProcessedUnmatchedAt === null) ||
      (failedWithoutMessage === 0) !== (oldestFailedUnmatchedAt === null)) {
    throw new Error('WhatsApp receipt reconciliation counts are inconsistent.');
  }
  return {
    processedReceipts,
    processedWithMessage,
    processedWithoutMessage,
    processedWithLink,
    failedReceipts,
    failedWithRawEvidence,
    failedWithMessage,
    failedWithoutMessage,
    failedWithLink,
    oldestProcessedUnmatchedAt,
    oldestFailedUnmatchedAt,
    checkedAt: checkedAt!,
  };
}
