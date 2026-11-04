/**
 * References only, not raw documents or user/customer information.
 * Draft reference IDs are pointers to separately secured evidence.
 */
export type PilotEvidenceDraftInput = {
  privacy_ref: string | null;
  retention_ref: string | null;
  provider_budget_ref: string | null;
  quality_review_ref: string | null;
};

const EVIDENCE_REFERENCE = /^[A-Z][A-Z0-9_-]{7,99}$/;

export function parseEvidenceReference(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') throw Error('Use a short evidence reference ID.');
  const clean = value.trim().toUpperCase();
  if (!clean) return null;
  if (!EVIDENCE_REFERENCE.test(clean)) {
    throw Error('Use an 8–100 character evidence reference ID (letters, digits, hyphens or underscores).');
  }
  return clean;
}

export function parsePilotEvidenceDraft(input: Record<string, unknown>): PilotEvidenceDraftInput {
  return {
    privacy_ref: parseEvidenceReference(input.privacy_ref),
    retention_ref: parseEvidenceReference(input.retention_ref),
    provider_budget_ref: parseEvidenceReference(input.provider_budget_ref),
    quality_review_ref: parseEvidenceReference(input.quality_review_ref),
  };
}
