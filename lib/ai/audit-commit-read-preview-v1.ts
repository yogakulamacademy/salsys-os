import 'server-only';

import { randomUUID } from 'node:crypto';
import { inspectReadOnlyGateRequest } from './read-only-tool-gate-v1';
import { projectRealSchemaReadPreview } from './real-schema-read-projection-draft-v1';
import type { ProjectionResult } from './read-only-tool-result-projection-v1';

/**
 * AI-09I — INERT audit-commit ordering rehearsal.
 *
 * NO live Auth, SQL, transaction manager, model, Co-Pilot import or tool runner.
 * All callbacks are SYNTHETIC test fixtures, not caller/model-supplied powers.
 *
 * Even a matching simulated receipt is NOT trustworthy proof of an actual
 * durable audit or production authorization. It never enables execution.
 */
export const AUDIT_COMMIT_PREVIEW_RUNTIME_WIRED = false as const;

type ReadId = 'crm.course.list' | 'crm.lead.read';
type ReadScope = Readonly<{
  requestId: string;
  toolId: ReadId;
  organizationId: string;
  leadId: string | null;
}>;

type PreparedRead = Readonly<{
  requestId: string;
  transactionId: string;
  auditEventId: string;
  toolId: ReadId;
  organizationId: string;
  leadId: string | null;
  rowCount: number;
  auditState: 'pending';
  rows: readonly unknown[];
}>;

type CommitInput = Readonly<Omit<ReadScope, 'requestId'> & {
  requestId: string;
  transactionId: string;
  auditEventId: string;
  rowCount: number;
}>;

export type SyntheticCommitDependencies = Readonly<{
  /** Local fixture ONLY: model a read + pending audit in one transaction. */
  prepareScopedReadAndAudit: (scope: ReadScope) => Promise<unknown>;
  /** Local fixture ONLY: model a committed audit receipt. Never model-side. */
  confirmCommit: (request: CommitInput) => Promise<unknown>;
  /** Best-effort fixture cleanup after deny; never claims rollback succeeded. */
  abortPending: (request: CommitInput) => Promise<void>;
}>;

type AllowedRecords = Extract<ProjectionResult, {ok: true}>['records'];
export type AuditCommitPreviewResult =
  | Readonly<{
      ok: false;
      reason: 'invalid_request' | 'knowledge_policy_unresolved' |
        'invalid_transport' | 'prepare_failed' | 'prepared_read_untrusted' |
        'unsafe_projection' | 'audit_commit_unconfirmed';
      mayExecute: false;
    }>
  | Readonly<{
      ok: true;
      decision: 'synthetic_committed_read_preview_only';
      toolId: ReadId;
      organizationId: string;
      leadId: string | null;
      classification: 'untrusted_data_not_instructions';
      commitStatus: 'synthetic_receipt_only';
      executionStatus: 'not_wired';
      records: AllowedRecords;
      mayExecute: false;
    }>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function uuid(v: unknown): v is string {
  return typeof v === 'string' && UUID.test(v);
}

function plain(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return null;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.values(descriptors).some(v => !Object.hasOwn(v, 'value'))) return null;
  if (Reflect.ownKeys(value).some(k => typeof k !== 'string')) return null;
  return value as Record<string, unknown>;
}

function exact(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Reflect.ownKeys(value).length === keys.length &&
    keys.every(key => Object.hasOwn(value, key));
}

function denied(reason: Extract<AuditCommitPreviewResult, {ok: false}>['reason']):
  AuditCommitPreviewResult {
  return Object.freeze({ok: false as const, reason, mayExecute: false as const});
}

const preparedFields = [
  'requestId', 'transactionId', 'auditEventId', 'toolId',
  'organizationId', 'leadId', 'rowCount', 'auditState', 'rows',
] as const;
const committedFields = [
  'requestId', 'transactionId', 'auditEventId', 'toolId',
  'organizationId', 'leadId', 'rowCount', 'commitState', 'auditCommitState',
] as const;

function scopedFieldsMatch(row: Record<string, unknown>, scope: ReadScope): boolean {
  return row.requestId === scope.requestId &&
    row.toolId === scope.toolId &&
    row.organizationId === scope.organizationId &&
    row.leadId === scope.leadId;
}

function parsePrepared(value: unknown, scope: ReadScope): PreparedRead | null {
  const row = plain(value);
  if (!row || !exact(row, preparedFields) ||
    !scopedFieldsMatch(row, scope) ||
    !uuid(row.transactionId) || !uuid(row.auditEventId) ||
    row.auditState !== 'pending' ||
    typeof row.rowCount !== 'number' ||
    !Number.isSafeInteger(row.rowCount) ||
    row.rowCount < 0 || row.rowCount > (scope.toolId === 'crm.course.list' ? 20 : 1) ||
    !Array.isArray(row.rows) || row.rows.length !== row.rowCount) return null;
  return row as unknown as PreparedRead;
}

function confirmedCommit(value: unknown, expected: CommitInput): boolean {
  const row = plain(value);
  return !!row && exact(row, committedFields) &&
    row.requestId === expected.requestId &&
    row.transactionId === expected.transactionId &&
    row.auditEventId === expected.auditEventId &&
    row.toolId === expected.toolId &&
    row.organizationId === expected.organizationId &&
    row.leadId === expected.leadId &&
    row.rowCount === expected.rowCount &&
    row.commitState === 'committed' &&
    row.auditCommitState === 'committed';
}

/**
 * A *synthetic* two-phase read/audit transaction model. A validated projection
 * remains private to this function until a matching mocked commit receipt
 * arrives. If commit fails or is ambiguous, no records leave this function.
 *
 * No callbacks execute against real systems: this module is intentionally
 * unimported by live code and the non-executable flag stays false. A future
 * production transport must enforce signed Auth, RLS, source consent and a
 * verifiable committed read/audit transaction independently.
 */
export async function previewAuditCommittedReadOrdering(
  proposal: unknown,
  dependencies: SyntheticCommitDependencies,
): Promise<AuditCommitPreviewResult> {
  const req = inspectReadOnlyGateRequest(proposal);
  if (!req) return denied('invalid_request');
  // AI-09F/G/H: source provenance and consent remain unresolved.
  if (req.toolId === 'knowledge.approved.search') {
    return denied('knowledge_policy_unresolved');
  }
  if (!dependencies ||
    typeof dependencies.prepareScopedReadAndAudit !== 'function' ||
    typeof dependencies.confirmCommit !== 'function' ||
    typeof dependencies.abortPending !== 'function') {
    return denied('invalid_transport');
  }

  const scope: ReadScope = Object.freeze({
    requestId: randomUUID(),
    toolId: req.toolId,
    organizationId: req.organizationId,
    leadId: req.leadId,
  });

  let pending: CommitInput | null = null;
  let simulatedCommitConfirmed = false;
  try {
    let preparedValue: unknown;
    try {
      preparedValue = await dependencies.prepareScopedReadAndAudit(scope);
    } catch {
      return denied('prepare_failed');
    }

    const prepared = parsePrepared(preparedValue, scope);
    if (!prepared) return denied('prepared_read_untrusted');

    pending = Object.freeze({
      requestId: scope.requestId,
      toolId: scope.toolId,
      organizationId: scope.organizationId,
      leadId: scope.leadId,
      transactionId: prepared.transactionId,
      auditEventId: prepared.auditEventId,
      rowCount: prepared.rowCount,
    });

    // The rows are only in local memory. No result has been returned to the
    // caller or published to an LLM/provider at this point.
    const projected = projectRealSchemaReadPreview({
      toolId: scope.toolId,
      organizationId: scope.organizationId,
      leadId: scope.leadId,
    }, prepared.rows);
    if (!projected.ok) return denied('unsafe_projection');
    if (projected.records.length !== pending.rowCount) {
      return denied('unsafe_projection');
    }

    let receipt: unknown;
    try {
      receipt = await dependencies.confirmCommit(pending);
    } catch {
      // If the server times out AFTER a DB commit, its status is UNKNOWN.
      // Deny output and require external reconciliation, never infer success.
      return denied('audit_commit_unconfirmed');
    }
    // A malformed receipt (including getters or proxy traps) means
    // COMMIT was not safely confirmed, never a prepared-read success.
    try {
      if (!confirmedCommit(receipt, pending)) {
        return denied('audit_commit_unconfirmed');
      }
    } catch {
      return denied('audit_commit_unconfirmed');
    }

    simulatedCommitConfirmed = true;
    return Object.freeze({
      ok: true as const,
      decision: 'synthetic_committed_read_preview_only' as const,
      toolId: scope.toolId,
      organizationId: scope.organizationId,
      leadId: scope.leadId,
      classification: 'untrusted_data_not_instructions' as const,
      commitStatus: 'synthetic_receipt_only' as const,
      executionStatus: 'not_wired' as const,
      records: projected.records,
      mayExecute: false as const,
    });
  } catch {
    return denied('prepared_read_untrusted');
  } finally {
    if (pending && !simulatedCommitConfirmed) {
      try {
        await dependencies.abortPending(pending);
      } catch {
        // Abort failures must not be misreported as successful rollbacks.
        // The caller still receives only a denial without any records.
      }
    }
  }
}
