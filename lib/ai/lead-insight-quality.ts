/** Staff evaluations are selected, human judgments — not measured model accuracy. */
export type InsightReviewRow = {
  rating: 'accurate' | 'partially_accurate' | 'inaccurate' | 'unsure';
  issue_codes: string[];
  run_id: string;
};

export type InsightQualitySummary = {
  reviewCount: number;
  distinctRunsReviewed: number;
  ratedAccurate: number;
  ratedPartiallyAccurate: number;
  ratedInaccurate: number;
  ratedUnsure: number;
  staffPositiveRate: number | null;
  issueCounts: Record<string, number>;
  caveat: string;
};

export function summarizeInsightReviews(rows: readonly InsightReviewRow[]): InsightQualitySummary {
  const counts = {
    accurate: 0,
    partially_accurate: 0,
    inaccurate: 0,
    unsure: 0,
  };
  const issues: Record<string, number> = {};
  const runs = new Set<string>();
  for (const row of rows) {
    if (!(row.rating in counts)) continue;
    counts[row.rating] += 1;
    runs.add(row.run_id);
    for (const code of new Set(row.issue_codes || [])) {
      if (typeof code !== 'string') continue;
      issues[code] = (issues[code] || 0) + 1;
    }
  }
  const evaluated = counts.accurate + counts.partially_accurate + counts.inaccurate;
  return {
    reviewCount: evaluated + counts.unsure,
    distinctRunsReviewed: runs.size,
    ratedAccurate: counts.accurate,
    ratedPartiallyAccurate: counts.partially_accurate,
    ratedInaccurate: counts.inaccurate,
    ratedUnsure: counts.unsure,
    staffPositiveRate: evaluated === 0 ? null : Math.round(1000 * (counts.accurate + counts.partially_accurate) / evaluated) / 10,
    issueCounts: issues,
    caveat: 'Voluntary staff ratings are a selected sample, not a calibrated measure of model accuracy, conversion uplift, or payment likelihood.',
  };
}
