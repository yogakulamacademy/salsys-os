export type InstagramReceiptReconciliation = {
  totalReceipts: number;
  processedReceipts: number;
  exactInboundMatches: number;
  ignoredNonMessageEnvelopes: number;
  ignoredContactShareDuplicates: number;
  processedWithoutExactMatchReview: number;
  ignoredAlreadyMatched: number;
  unprocessedOrMissingStatus: number;
  checkedAt: string;
};

const FIELDS = [
  'totalReceipts',
  'processedReceipts',
  'exactInboundMatches',
  'ignoredNonMessageEnvelopes',
  'ignoredContactShareDuplicates',
  'processedWithoutExactMatchReview',
  'ignoredAlreadyMatched',
  'unprocessedOrMissingStatus',
  'checkedAt',
] as const;

function count(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error('Instagram receipt reconciliation has invalid counts.');
  }
  return value;
}

/** Strict allowlist prevents customer data or provider identifiers reaching UI. */
export function parseInstagramReceiptReconciliation(value: unknown):
  InstagramReceiptReconciliation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Instagram receipt reconciliation is unavailable.');
  }
  const data = value as Record<string, unknown>;
  if (Object.keys(data).length !== FIELDS.length ||
      Object.keys(data).some(key => !(FIELDS as readonly string[]).includes(key))) {
    throw new Error('Instagram receipt reconciliation contains unexpected fields.');
  }
  const report: InstagramReceiptReconciliation = {
    totalReceipts: count(data.totalReceipts),
    processedReceipts: count(data.processedReceipts),
    exactInboundMatches: count(data.exactInboundMatches),
    ignoredNonMessageEnvelopes: count(data.ignoredNonMessageEnvelopes),
    ignoredContactShareDuplicates: count(data.ignoredContactShareDuplicates),
    processedWithoutExactMatchReview: count(data.processedWithoutExactMatchReview),
    ignoredAlreadyMatched: count(data.ignoredAlreadyMatched),
    unprocessedOrMissingStatus: count(data.unprocessedOrMissingStatus),
    checkedAt: data.checkedAt as string,
  };
  if (typeof report.checkedAt !== 'string' ||
      report.checkedAt.length > 45 ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(report.checkedAt) ||
      !Number.isFinite(Date.parse(report.checkedAt))) {
    throw new Error('Instagram receipt reconciliation has invalid observation time.');
  }
  if (report.processedReceipts + report.unprocessedOrMissingStatus !== report.totalReceipts ||
      report.exactInboundMatches + report.ignoredNonMessageEnvelopes +
        report.ignoredContactShareDuplicates + report.processedWithoutExactMatchReview !==
          report.processedReceipts ||
      report.ignoredAlreadyMatched > report.exactInboundMatches) {
    throw new Error('Instagram receipt reconciliation totals are inconsistent.');
  }
  return report;
}
