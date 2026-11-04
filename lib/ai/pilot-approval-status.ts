/**
 * C5d: Read-only interpretation of explicitly recorded sign-off metadata.
 * Authoritative decision to reserve quota occurs inside PostgreSQL, never here.
 */
export type PilotApprovalRecord = {
  policy_version: string;
  privacy_approved_at: string | null;
  retention_approved_at: string | null;
  provider_budget_verified_at: string | null;
  quality_review_approved_at: string | null;
  approved_by: string | null;
  approval_reference: string | null;
  expires_at: string | null;
  revoked_at: string | null;
};

export type PilotApprovalStatus =
  | 'missing' | 'partial' | 'expired' | 'revoked' | 'approved';

function validPastTimestamp(value: string | null, now: Date): boolean {
  if (!value) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && time <= now.getTime();
}

export function evaluatePilotApproval(
  record: PilotApprovalRecord | null,
  now: Date,
): { status: PilotApprovalStatus; approved: boolean } {
  if (!record) return { status: 'missing', approved: false };
  if (record.revoked_at) return { status: 'revoked', approved: false };
  if (record.policy_version !== 'lead_insight_pilot_v1') {
    return { status: 'partial', approved: false };
  }
  if (!record.expires_at || !Number.isFinite(Date.parse(record.expires_at)) ||
      Date.parse(record.expires_at) <= now.getTime()) {
    return { status: 'expired', approved: false };
  }

  const complete =
    validPastTimestamp(record.privacy_approved_at, now) &&
    validPastTimestamp(record.retention_approved_at, now) &&
    validPastTimestamp(record.provider_budget_verified_at, now) &&
    validPastTimestamp(record.quality_review_approved_at, now) &&
    Boolean(record.approved_by?.trim()) &&
    Boolean(record.approval_reference && record.approval_reference.trim().length >= 8);
  return complete
    ? { status: 'approved', approved: true }
    : { status: 'partial', approved: false };
}
