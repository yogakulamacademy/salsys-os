import 'server-only';

import { randomUUID } from 'node:crypto';

/**
 * AI-09B: audit-gated, read-only tool *eligibility* contract.
 *
 * NOT an authorized executor: no database connection, RPC, HTTP, Anthropic
 * call, tool dispatch, results, mutable CRM action, or production import.
 * An eligible decision is not a grant to execute. Keep compile-time off.
 *
 * The dependency functions model a FUTURE server-owned Auth/session verifier,
 * per-resource DB authorization check, and durable audit writer. They are
 * supplied as synthetic fakes by tests. Never let a browser, LLM, or webhook
 * choose these callbacks or provide its own "verified" principal.
 */
export const READ_ONLY_TOOL_GATE_RUNTIME_WIRED = false as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOOL_IDS = [
  'knowledge.approved.search',
  'crm.course.list',
  'crm.lead.read',
] as const;
export type GateToolId = (typeof TOOL_IDS)[number];

const KNOWN_ROLES = ['owner', 'admin'] as const;
type GateRole = (typeof KNOWN_ROLES)[number];

export type GatePrincipal = Readonly<{
  organizationId: string;
  actorId: string;
  sessionId: string;
  boundOrganizationId: string;
  role: GateRole | 'member' | 'viewer';
  sessionActive: boolean;
  membershipActive: boolean;
  organizationActive: boolean;
}>;

export type GateRequest = Readonly<{
  toolId: GateToolId;
  organizationId: string;
  leadId: string | null;
  query: string | null;
}>;

export type GateAudit = Readonly<{
  traceId: string;
  occurredAt: string;
  toolId: GateToolId | null;
  organizationId: string | null;
  actorId: string | null;
  leadId: string | null;
  decision: 'denied' | 'review_eligible';
  reason: string;
}>;

export type GateDependencies = Readonly<{
  /** Must independently resolve currently signed-in Auth *from the server*. */
  getCurrentPrincipal: () => Promise<unknown>;
  /** Must enforce current DB RLS/role/lead grants and document consent. */
  checkCurrentResourceAccess: (
    principal: Readonly<GatePrincipal>,
    request: Readonly<GateRequest>,
  ) => Promise<boolean>;
  /** Must durably append this minimal audit in approved server storage. */
  appendAudit: (event: GateAudit) => Promise<boolean>;
}>;

export type GateResult =
  | Readonly<{ ok: false; reason: string; traceId: string; mayExecute: false }>
  | Readonly<{
      ok: true;
      traceId: string;
      decision: 'review_eligible';
      toolId: GateToolId;
      organizationId: string;
      leadId: string | null;
      executionStatus: 'not_wired';
      mayExecute: false;
    }>;

type Rejection =
  | 'invalid_tool_request'
  | 'unauthenticated_or_unbound'
  | 'role_not_eligible'
  | 'wrong_tenant'
  | 'resource_denied'
  | 'identity_changed'
  | 'verification_unavailable';

/**
 * Read proposed route/identity fields only from own DATA properties.
 *
 * Do not inspect caller-controlled getters, proxies or prototypes as trusted
 * credentials. In particular, an accessor throw during proposal validation
 * could previously escape before the denied-attempt audit was appended.
 *
 * Return a detached, frozen, null-prototype copy to prevent later reads from
 * re-triggering a getter or observing a changed caller-owned property.
 */
function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object') return null;
  try {
    // Array.isArray() itself throws for a revoked Proxy, so it MUST be
    // inside this catch boundary to preserve the denied-attempt audit.
    if (Array.isArray(value)) return null;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const keys = Reflect.ownKeys(value);
    if (keys.some(key => typeof key !== 'string')) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const data: Record<string, unknown> = Object.create(null);
    for (const key of keys as string[]) {
      const descriptor = descriptors[key];
      if (!descriptor || !Object.hasOwn(descriptor, 'value') ||
        descriptor.enumerable !== true) return null;
      data[key] = descriptor.value;
    }
    return Object.freeze(data);
  } catch {
    // Hostile proxy traps and unusual objects are invalid, never trusted.
    return null;
  }
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

function exactFields(value: Record<string, unknown>, fields: readonly string[]): boolean {
  return Object.keys(value).length === fields.length &&
    fields.every(field => Object.hasOwn(value, field));
}

/**
 * A model proposes only a known read operation and an exact resource scope.
 * It cannot supply an actor, role, capability, URL, SQL, tool arguments,
 * callback, HTTP method, or executable payload.
 */
export function inspectReadOnlyGateRequest(value: unknown): GateRequest | null {
  const row = asRecord(value);
  if (!row || !exactFields(row, ['toolId', 'organizationId', 'leadId', 'query']) ||
    typeof row.toolId !== 'string' ||
    !TOOL_IDS.includes(row.toolId as GateToolId) ||
    !isUuid(row.organizationId)) return null;

  const toolId = row.toolId as GateToolId;
  if (toolId === 'knowledge.approved.search') {
    if (row.leadId !== null || typeof row.query !== 'string' ||
      row.query.trim() !== row.query ||
      Buffer.byteLength(row.query, 'utf8') < 2 ||
      Buffer.byteLength(row.query, 'utf8') > 160 ||
      /[\u0000-\u001f\u007f]/.test(row.query)) return null;
  } else if (toolId === 'crm.course.list') {
    if (row.leadId !== null || row.query !== null) return null;
  } else if (!isUuid(row.leadId) || row.query !== null) {
    return null;
  }

  return Object.freeze({
    toolId,
    organizationId: row.organizationId,
    leadId: row.leadId as string | null,
    query: row.query as string | null,
  });
}

/**
 * This checks STRUCTURAL plausibility only; a caller-supplied object with
 * sessionActive:true is not evidence of real authentication.
 */
function inspectPrincipal(value: unknown): GatePrincipal | null {
  const row = asRecord(value);
  if (!row || !exactFields(row, [
    'organizationId', 'actorId', 'sessionId', 'boundOrganizationId',
    'role', 'sessionActive', 'membershipActive', 'organizationActive',
  ]) ||
    !isUuid(row.organizationId) || !isUuid(row.actorId) ||
    !isUuid(row.sessionId) || !isUuid(row.boundOrganizationId) ||
    (typeof row.role !== 'string' || ![...KNOWN_ROLES, 'member', 'viewer'].includes(row.role)) ||
    row.sessionActive !== true || row.membershipActive !== true ||
    row.organizationActive !== true ||
    row.organizationId !== row.boundOrganizationId) return null;
  return Object.freeze({
    organizationId: row.organizationId,
    actorId: row.actorId,
    sessionId: row.sessionId,
    boundOrganizationId: row.boundOrganizationId,
    role: row.role as GatePrincipal['role'],
    sessionActive: true,
    membershipActive: true,
    organizationActive: true,
  });
}

function samePrincipal(a: GatePrincipal, b: GatePrincipal): boolean {
  return a.organizationId === b.organizationId &&
    a.actorId === b.actorId &&
    a.sessionId === b.sessionId &&
    a.boundOrganizationId === b.boundOrganizationId &&
    a.role === b.role;
}

/**
 * No actual read happens even when eligible. This is a negative-testable
 * orchestration seam for independent review of trust and audit requirements.
 * Future implementation must separately recheck Auth/RLS at the actual
 * database operation, with tenant-scoped queries and response redaction.
 *
 * Every denial attempts to emit only minimal audit metadata. If audit cannot
 * confirm a durable write, NO eligible result can be returned.
 */
export async function reviewReadOnlyToolGate(
  proposal: unknown,
  dependencies: GateDependencies,
): Promise<GateResult> {
  const traceId = randomUUID();
  const request = inspectReadOnlyGateRequest(proposal);
  let principal: GatePrincipal | null = null;

  const finalize = async (
    reason: Rejection | 'review_eligible',
    allowed: boolean,
  ): Promise<GateResult> => {
    const audit = Object.freeze({
      traceId,
      occurredAt: new Date().toISOString(),
      toolId: request?.toolId ?? null,
      organizationId: principal?.organizationId ?? null,
      actorId: principal?.actorId ?? null,
      leadId: request?.leadId ?? null,
      decision: (allowed ? 'review_eligible' : 'denied') as GateAudit['decision'],
      reason,
    });
    try {
      if (await dependencies.appendAudit(audit) !== true) {
        return Object.freeze({ ok: false, reason: 'audit_unavailable', traceId, mayExecute: false });
      }
    } catch {
      return Object.freeze({ ok: false, reason: 'audit_unavailable', traceId, mayExecute: false });
    }
    if (allowed && request) {
      return Object.freeze({
        ok: true,
        traceId,
        decision: 'review_eligible' as const,
        toolId: request.toolId,
        organizationId: request.organizationId,
        leadId: request.leadId,
        executionStatus: 'not_wired' as const,
        mayExecute: false as const,
      });
    }
    return Object.freeze({ ok: false, reason, traceId, mayExecute: false });
  };

  if (!request) return finalize('invalid_tool_request', false);
  if (!dependencies ||
    typeof dependencies.getCurrentPrincipal !== 'function' ||
    typeof dependencies.checkCurrentResourceAccess !== 'function' ||
    typeof dependencies.appendAudit !== 'function') {
    return Object.freeze({ ok: false, reason: 'verification_unavailable', traceId, mayExecute: false });
  }

  try {
    principal = inspectPrincipal(await dependencies.getCurrentPrincipal());
    if (!principal) return finalize('unauthenticated_or_unbound', false);
    if (principal.organizationId !== request.organizationId) return finalize('wrong_tenant', false);
    if (!KNOWN_ROLES.includes(principal.role as GateRole)) {
      return finalize('role_not_eligible', false);
    }

    const authorized = await dependencies.checkCurrentResourceAccess(principal, request);
    if (authorized !== true) return finalize('resource_denied', false);

    // A second server-side session/membership check catches revocation or
    // identity rotation during the resource-grant decision; a real dispatcher
    // must still enforce authorization at the actual read transaction.
    const latest = inspectPrincipal(await dependencies.getCurrentPrincipal());
    if (!latest || !samePrincipal(principal, latest)) {
      return finalize('identity_changed', false);
    }
    return finalize('review_eligible', true);
  } catch {
    return finalize('verification_unavailable', false);
  }
}
