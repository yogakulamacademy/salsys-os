/**
 * KB-02E: Audit-only preflight contract for future website-evidence storage.
 *
 * This deliberately NEVER authorizes persistence, approval, knowledge
 * publication, or model calls. Values are a diagnostic snapshot, not
 * permissions; a future write path must independently verify them in the
 * tenant-bound database transaction.
 *
 * There are NO defaults for tenant consent, retention periods, or deletion.
 */

export type EvidenceConsentRecord = {
  organizationId: string;
  hostname: string;
  purpose: 'website_evidence_review';
  status: 'granted' | 'pending' | 'denied' | 'withdrawn';
  grantedBy: string | null;
  grantedAt: string | null;
  validUntil: string | null;
  policyVersion: string | null;
};

export type EvidenceRetentionPolicyRecord = {
  organizationId: string;
  status: 'approved' | 'draft' | 'withdrawn';
  version: string;
  quoteRetentionDays: number | null;
  rawHtmlStorage: 'forbidden' | 'not_decided' | 'permitted';
  deletionPlanReviewed: boolean;
  deletionRehearsalPassed: boolean;
  auditTrailReviewed: boolean;
  auditRehearsalPassed: boolean;
};

export type EvidenceReadinessSnapshot = {
  authenticatedAdmin: boolean;
  activeOrganizationId: string | null;
  evidenceOrganizationId: string | null;
  sourceUrl: string | null;
  verifiedHostname: string | null;
  domainVerifiedUntil: string | null;
  consent: EvidenceConsentRecord | null;
  retention: EvidenceRetentionPolicyRecord | null;
  tenantRlsRehearsalPassed: boolean;
  controlledStagingReadinessPassed: boolean;
};

export type EvidenceReadinessGateId =
  | 'admin_access'
  | 'tenant_binding'
  | 'verified_https_hostname'
  | 'active_domain_ownership'
  | 'active_extraction_consent'
  | 'approved_retention_decision'
  | 'deletion_rehearsal'
  | 'audit_rehearsal'
  | 'isolated_staging_acceptance';

export type EvidenceReadinessGate = {
  id: EvidenceReadinessGateId;
  label: string;
  status: 'satisfied' | 'blocked';
  description: string;
};

export type EvidenceReadinessResult = {
  state: 'blocked' | 'eligible_for_review_only';
  satisfied: number;
  total: number;
  gates: EvidenceReadinessGate[];
  canStoreEvidence: false;
  canStoreRawHtml: false;
  canPublishKnowledge: false;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validUuid(value: string | null | undefined): value is string {
  return typeof value === 'string' && UUID.test(value);
}

function validTimestamp(value: string | null | undefined, now: number): boolean {
  if (!value || typeof value !== 'string') return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp > now;
}

function validSourceOnHost(source: string | null, host: string | null): boolean {
  if (!source || !host || source.length > 2048 || host.length > 253) return false;
  try {
    const url = new URL(source);
    return url.protocol === 'https:' &&
      url.username === '' && url.password === '' &&
      url.port === '' &&
      url.hostname === host.toLowerCase() &&
      /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(url.hostname) &&
      !url.hostname.includes('..') && !url.hostname.endsWith('.local');
  } catch {
    return false;
  }
}

function versioned(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 100;
}

/**
 * Diagnostics only. Passing all gates means a policy can be considered for
 * a future staging write-path review, NEVER that the application may store.
 */
export function assessEvidenceReadiness(
  snapshot: EvidenceReadinessSnapshot | null | undefined,
  at = Date.now(),
): EvidenceReadinessResult {
  const active = snapshot?.activeOrganizationId ?? null;
  const tenantMatched = validUuid(active) && active === snapshot?.evidenceOrganizationId;
  const sourceMatched = validSourceOnHost(
    snapshot?.sourceUrl ?? null, snapshot?.verifiedHostname ?? null,
  );
  const consent = snapshot?.consent ?? null;
  const policy = snapshot?.retention ?? null;

  const gates: EvidenceReadinessGate[] = [];
  const add = (
    id: EvidenceReadinessGateId, label: string,
    satisfied: boolean, description: string,
  ) => gates.push({ id, label, status: satisfied ? 'satisfied' : 'blocked', description });

  add('admin_access', 'Authenticated organization administrator',
    snapshot?.authenticatedAdmin === true && validUuid(active),
    'An authenticated owner/admin must independently authorize every tenant write.');

  add('tenant_binding', 'Same-organization evidence',
    tenantMatched,
    'The active workspace and the source evidence must belong to the same organization.');

  add('verified_https_hostname', 'Exact HTTPS source scope',
    sourceMatched,
    'The source URL must be HTTPS and match the exactly verified hostname.');

  add('active_domain_ownership', 'Current website ownership',
    sourceMatched && validTimestamp(snapshot?.domainVerifiedUntil, at),
    'The domain challenge must still be verified, with no hostname alias expansion.');

  const consentValid =
    tenantMatched && sourceMatched && consent?.status === 'granted' &&
    consent.organizationId === active &&
    consent.hostname === snapshot?.verifiedHostname &&
    consent.purpose === 'website_evidence_review' &&
    validUuid(consent.grantedBy) &&
    versioned(consent.policyVersion) &&
    typeof consent.grantedAt === 'string' &&
    Number.isFinite(Date.parse(consent.grantedAt)) &&
    Date.parse(consent.grantedAt) <= at &&
    validTimestamp(consent.validUntil, at);
  add('active_extraction_consent', 'Explicit tenant extraction consent',
    Boolean(consentValid),
    'The tenant must explicitly grant, scope, and maintain unexpired website evidence consent.');

  const retentionValid =
    policy?.organizationId === active &&
    policy?.status === 'approved' &&
    versioned(policy.version) &&
    Number.isSafeInteger(policy.quoteRetentionDays) &&
    (policy.quoteRetentionDays ?? 0) > 0 &&
    policy.rawHtmlStorage === 'forbidden';
  add('approved_retention_decision', 'Approved quotation retention',
    Boolean(retentionValid),
    'Quote retention needs an approved duration. Raw HTML remains forbidden in this checkpoint.');

  add('deletion_rehearsal', 'Deletion and consent withdrawal tested',
    Boolean(retentionValid && policy?.deletionPlanReviewed && policy?.deletionRehearsalPassed),
    'Erasure and withdrawal must be specified and tested on isolated staging.');

  add('audit_rehearsal', 'Audited access and transitions tested',
    Boolean(retentionValid && policy?.auditTrailReviewed && policy?.auditRehearsalPassed),
    'Tenant-bound review, approval, and deletion audit behavior requires separate testing.');

  add('isolated_staging_acceptance', 'Isolated staging database acceptance',
    Boolean(snapshot?.tenantRlsRehearsalPassed &&
      snapshot?.controlledStagingReadinessPassed),
    'The RLS, credentials, retention scheduler, and API must pass dedicated staging tests.');

  const satisfied = gates.filter(g=>g.status==='satisfied').length;
  return {
    state: satisfied === gates.length ? 'eligible_for_review_only' : 'blocked',
    satisfied, total: gates.length, gates,
    canStoreEvidence:false, canStoreRawHtml:false, canPublishKnowledge:false,
  };
}
