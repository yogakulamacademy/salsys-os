import type {
  PreparedWebsiteEvidence,
  SourceEvidenceBlock,
} from './website-evidence';

/**
 * Session-only KB-02D review planning.
 *
 * Candidate != approved. This module never persists, publishes, generates a
 * knowledge item or changes approved retrieval. All effects must stay outside.
 */
export type EvidenceReviewChoice = 'candidate' | 'excluded';
export type EvidenceReviewDecisions = Readonly<Record<string, EvidenceReviewChoice>>;

export type EvidenceReviewSummary = {
  total: number;
  pending: number;
  candidate: number;
  excluded: number;
  publishable: false;
  canPersist: false;
};

function eligibleBlock(block: SourceEvidenceBlock): boolean {
  return block.reviewStatus === 'unreviewed'
    && /^[a-f0-9]{64}$/.test(block.id)
    && /^[a-f0-9]{64}$/.test(block.quoteSha256)
    && block.quote.length > 0;
}

export function chooseEvidenceForReview(
  evidence: PreparedWebsiteEvidence,
  decisions: EvidenceReviewDecisions,
  blockId: string,
  choice: EvidenceReviewChoice | null,
): EvidenceReviewDecisions {
  if (!evidence?.blocks?.some(block => block.id === blockId && eligibleBlock(block))) {
    return decisions;
  }
  if (choice !== null && choice !== 'candidate' && choice !== 'excluded') return decisions;
  const next = { ...decisions };
  if (choice === null) delete next[blockId];
  else next[blockId] = choice;
  return next;
}

export function summarizeEvidenceReview(
  evidence: PreparedWebsiteEvidence,
  decisions: EvidenceReviewDecisions,
): EvidenceReviewSummary {
  const validIds = new Set(
    (evidence?.blocks ?? []).filter(eligibleBlock).map(block => block.id),
  );
  let candidate = 0;
  let excluded = 0;
  for (const [id, choice] of Object.entries(decisions)) {
    if (!validIds.has(id)) continue;
    if (choice === 'candidate') candidate++;
    if (choice === 'excluded') excluded++;
  }
  return {
    total: validIds.size,
    pending: validIds.size - candidate - excluded,
    candidate,
    excluded,
    publishable: false,
    canPersist: false,
  };
}

/** UI plans can only be expressed in terms of source-backed identities. */
export function reviewChoicesForDisplay(
  evidence: PreparedWebsiteEvidence,
  decisions: EvidenceReviewDecisions,
): Array<{ block: SourceEvidenceBlock; choice: EvidenceReviewChoice | null }> {
  return (evidence?.blocks ?? [])
    .filter(eligibleBlock)
    .map(block => ({ block, choice: decisions[block.id] ?? null }));
}
