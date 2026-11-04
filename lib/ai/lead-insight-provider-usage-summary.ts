/**
 * Tenant-scoped usage monitoring based on Anthropic's response token counters.
 * These counters are NOT invoices and do not calculate USD cost.
 */
export type ProviderUsageRow = {
  outcome: string;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_creation_input_tokens: number | null;
  cache_read_input_tokens: number | null;
};

export type ProviderUsageSummary = {
  calls: number;
  providerCompleted: number | null;
  nonCompleted: number | null;
  pending: number | null;
  usageReported: number | null;
  tokenReadingsComplete: boolean;
  reportedInputTokens: number | null;
  reportedOutputTokens: number | null;
  reportedCacheCreationTokens: number | null;
  reportedCacheReadTokens: number | null;
  sampleTruncated: boolean;
  caveat: string;
};

function safeNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export function summarizeProviderUsage(
  rows: readonly ProviderUsageRow[],
  totalCount: number,
): ProviderUsageSummary {
  const count = Number.isSafeInteger(totalCount) && totalCount >= 0 ? totalCount : 0;
  const truncated = rows.length < count;
  const base: ProviderUsageSummary = {
    calls: count,
    providerCompleted: null,
    nonCompleted: null,
    pending: null,
    usageReported: null,
    tokenReadingsComplete: false,
    reportedInputTokens: null,
    reportedOutputTokens: null,
    reportedCacheCreationTokens: null,
    reportedCacheReadTokens: null,
    sampleTruncated: truncated,
    caveat: 'Token readings are provider-reported metadata, not monetary spend or billing totals. Missing measurements and failed calls can affect completeness.',
  };
  if (truncated) return base;

  let completed = 0;
  let nonCompleted = 0;
  let pending = 0;
  let reported = 0;
  let input = 0;
  let output = 0;
  let cacheCreation = 0;
  let cacheRead = 0;
  let allCompletedReported = true;

  for (const row of rows) {
    if (row.outcome === 'started') pending += 1;
    else if (row.outcome === 'provider_completed') completed += 1;
    else nonCompleted += 1;

    const nInput = safeNumber(row.input_tokens);
    const nOutput = safeNumber(row.output_tokens);
    const nCreated = safeNumber(row.cache_creation_input_tokens);
    const nRead = safeNumber(row.cache_read_input_tokens);
    if (nInput !== null && nOutput !== null) {
      reported += 1;
      input += nInput;
      output += nOutput;
      cacheCreation += nCreated ?? 0;
      cacheRead += nRead ?? 0;
    } else if (row.outcome === 'provider_completed') {
      allCompletedReported = false;
    }
  }

  return {
    ...base,
    providerCompleted: completed,
    nonCompleted,
    pending,
    usageReported: reported,
    tokenReadingsComplete: allCompletedReported && nonCompleted === 0 && pending === 0,
    reportedInputTokens: input,
    reportedOutputTokens: output,
    reportedCacheCreationTokens: cacheCreation,
    reportedCacheReadTokens: cacheRead,
  };
}
