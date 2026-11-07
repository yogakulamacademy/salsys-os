import { isIP } from 'node:net';

/**
 * KB-04B: review-only website refresh policy evaluation.
 *
 * Inputs are snapshots supplied by an upstream authenticated controller, NOT
 * proof of ownership, consent, robots permission, or an authorized job.
 * This module has no network, database, job enqueue, or write capability.
 * Even when every diagnostic is satisfied, execution stays disabled.
 */
export type RefreshConsent = {
  organizationId: string;
  verifiedHostname: string;
  purpose: 'website_change_monitoring';
  status: 'granted' | 'pending' | 'denied' | 'withdrawn';
  grantedBy: string | null;
  grantedAt: string | null;
  validUntil: string | null;
  policyVersion: string | null;
};

export type RefreshLimits = {
  organizationId: string;
  status: 'approved' | 'draft' | 'withdrawn';
  version: string;
  pagesPerRun: number;
  pagesPerDay: number;
  minimumIntervalMinutes: number;
  concurrentRuns: number;
  respectRobotsTxt: boolean;
  redirects: 'forbidden';
  crossOriginRequests: 'forbidden';
};

export type RefreshOperations = {
  globalEmergencyStop: boolean;
  organizationPaused: boolean;
  ownershipRevoked: boolean;
  consentWithdrawalObserved: boolean;
  robotsDecision: 'allowed' | 'disallowed' | 'unknown';
  pagesUsedToday: number;
  runningJobs: number;
  lastRunFinishedAt: string | null;
};

export type RefreshPreflightInput = {
  activeOrganizationId: string;
  evidenceOrganizationId: string;
  sourceUrl: string;
  verifiedHostname: string;
  // Must be computed by assessEvidenceReadiness in the same authenticated
  // context; this advisory flag is never accepted as a write authorization.
  evidenceLifecycleState: 'blocked' | 'eligible_for_review_only';
  consent: RefreshConsent | null;
  limits: RefreshLimits | null;
  operations: RefreshOperations | null;
};

export type RefreshGate = {
  id: 'tenant_and_https_scope' | 'evidence_lifecycle' |
    'refresh_consent' | 'approved_bounded_limits' | 'emergency_stop' |
    'robots_policy' | 'capacity_and_cooldown';
  status: 'satisfied' | 'blocked';
  reason: string;
};

export type RefreshPreflight = {
  schemaVersion: 'kb04b-v1';
  status: 'blocked' | 'reviewable_in_isolated_staging_only';
  evaluatedAt: string;
  sourceUrl: string | null;
  gates: RefreshGate[];
  satisfied: number;
  total: number;
  // The status is NOT a scheduling, fetch or storage permission.
  evidenceVerifiedAtExecution: false;
  canEnqueue: false;
  canCrawl: false;
  canStore: false;
  canSyncKnowledge: false;
  canApprove: false;
  canPublish: false;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isUuid(s: unknown): s is string {
  return typeof s === 'string' && UUID.test(s);
}
function timestamp(value: unknown): number | null {
  if (typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) return null;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return null;
  // Date.parse normalizes impossible dates on some runtimes. Round-trip the
  // original UTC components so 2026-02-30 never passes as a fresh timestamp.
  const [prefix, milliseconds = ''] = value.slice(0, -1).split('.');
  const canonical = prefix + '.' + milliseconds.padEnd(3, '0') + 'Z';
  return new Date(time).toISOString() === canonical ? time : null;
}
function version(value: unknown): boolean {
  return typeof value === 'string' && value.trim() !== '' && value.length <= 100;
}
function exactHttpsPage(url: unknown, hostname: unknown): boolean {
  if (typeof url !== 'string' || url.length > 2048 ||
    typeof hostname !== 'string' || hostname.length > 253 ||
    hostname !== hostname.toLowerCase() ||
    !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/.test(hostname) ||
    hostname.includes('..') || isIP(hostname)) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname === hostname &&
      !parsed.username && !parsed.password && !parsed.port &&
      !parsed.search && !parsed.hash && parsed.href === url;
  } catch { return false; }
}
function bounded(limits: RefreshLimits | null, org: string): boolean {
  return !!limits && limits.organizationId === org &&
    limits.status === 'approved' && version(limits.version) &&
    Number.isSafeInteger(limits.pagesPerRun) &&
    limits.pagesPerRun >= 1 && limits.pagesPerRun <= 25 &&
    Number.isSafeInteger(limits.pagesPerDay) &&
    limits.pagesPerDay >= limits.pagesPerRun && limits.pagesPerDay <= 100 &&
    Number.isSafeInteger(limits.minimumIntervalMinutes) &&
    limits.minimumIntervalMinutes >= 60 &&
    Number.isSafeInteger(limits.concurrentRuns) &&
    limits.concurrentRuns === 1 &&
    limits.respectRobotsTxt === true &&
    limits.redirects === 'forbidden' &&
    limits.crossOriginRequests === 'forbidden';
}
export function assessWebsiteRefreshPreflight(
  input: RefreshPreflightInput | null | undefined,
  at: string,
): RefreshPreflight {
  const time = timestamp(at);
  const now = time ?? Number.NaN;
  const org = input?.activeOrganizationId ?? '';
  const scopeOk = isUuid(org) && input?.evidenceOrganizationId === org &&
    exactHttpsPage(input?.sourceUrl, input?.verifiedHostname);
  const consent = input?.consent ?? null;
  const consentSince = timestamp(consent?.grantedAt);
  const consentUntil = timestamp(consent?.validUntil);
  const consentOk = scopeOk && consent?.organizationId === org &&
    consent?.verifiedHostname === input?.verifiedHostname &&
    consent?.purpose === 'website_change_monitoring' &&
    consent?.status === 'granted' && isUuid(consent?.grantedBy) &&
    version(consent?.policyVersion) &&
    consentSince !== null && consentUntil !== null &&
    Number.isFinite(now) && consentSince <= now && consentUntil > now;
  const limits = input?.limits ?? null;
  const limitsOk = bounded(limits, org);
  const ops = input?.operations ?? null;
  const stopOk = !!ops && ops.globalEmergencyStop === false &&
    ops.organizationPaused === false && ops.ownershipRevoked === false &&
    ops.consentWithdrawalObserved === false;
  // Robots status comes from the caller and must be rechecked by the future
  // executor immediately before each request. Unknown is always blocked.
  const robotsOk = !!ops && ops.robotsDecision === 'allowed';
  const finished = ops?.lastRunFinishedAt == null
    ? null : timestamp(ops.lastRunFinishedAt);
  const cooldownOk = !!ops && !!limits && Number.isFinite(now) &&
    Number.isSafeInteger(ops.pagesUsedToday) && ops.pagesUsedToday >= 0 &&
    Number.isSafeInteger(ops.runningJobs) && ops.runningJobs >= 0 &&
    ops.runningJobs < limits.concurrentRuns &&
    ops.pagesUsedToday + limits.pagesPerRun <= limits.pagesPerDay &&
    (ops.lastRunFinishedAt === null ||
      (finished !== null && finished <= now &&
        now - finished >= limits.minimumIntervalMinutes * 60_000));
  const gates: RefreshGate[] = [];
  const add = (id: RefreshGate['id'], ok: boolean, reason: string) =>
    gates.push({ id, status: ok ? 'satisfied' : 'blocked', reason });
  add('tenant_and_https_scope', scopeOk,
    'Exact tenant-bound verified HTTPS hostname and canonical page only.');
  add('evidence_lifecycle',
    input?.evidenceLifecycleState === 'eligible_for_review_only',
    'Separate evidence retention, deletion, consent and staging readiness must pass review.');
  add('refresh_consent', !!consentOk,
    'Explicit unexpired monitoring-purpose consent for this exact organization and hostname.');
  add('approved_bounded_limits', limitsOk,
    'Approved limits: at most 25 pages/run, 100/day, one running job, hourly spacing; no redirects/cross-origin.');
  add('emergency_stop', stopOk,
    'Any kill switch, tenant pause, ownership revocation or withdrawal blocks a refresh.');
  add('robots_policy', robotsOk,
    'Robots permission must be known as allowed and independently rechecked at execution.');
  add('capacity_and_cooldown', !!(limitsOk && cooldownOk),
    'No overlapping job, exhausted daily budget, future finish time or cooldown violation.');
  const satisfied = gates.filter(g => g.status === 'satisfied').length;
  return {
    schemaVersion: 'kb04b-v1',
    status: time !== null && satisfied === gates.length
      ? 'reviewable_in_isolated_staging_only' : 'blocked',
    evaluatedAt: at,
    sourceUrl: scopeOk ? input!.sourceUrl : null,
    gates, satisfied, total: gates.length,
    evidenceVerifiedAtExecution: false,
    canEnqueue: false, canCrawl: false, canStore: false,
    canSyncKnowledge: false, canApprove: false, canPublish: false,
  };
}
