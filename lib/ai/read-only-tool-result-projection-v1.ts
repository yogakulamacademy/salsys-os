import 'server-only';

/**
 * AI-09C: proposed read-only result projection, NOT a read authorization.
 *
 * This pure, server-only contract does not fetch records, contact a provider,
 * authenticate a session, approve Knowledge, or connect to the live Co-Pilot.
 * A future independently reviewed dispatcher MUST enforce Auth, tenant RLS,
 * resource grants and current consent/source status in the actual read transaction.
 */
export const READ_ONLY_TOOL_RESULT_RUNTIME_WIRED = false as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const TOOLS = ['knowledge.approved.search', 'crm.course.list', 'crm.lead.read'] as const;
export type ResultToolId = (typeof TOOLS)[number];

export type ResultScope = Readonly<{
  toolId: ResultToolId;
  organizationId: string;
  leadId: string | null;
}>;

export type KnowledgeProjection = Readonly<{
  organizationId: string;
  documentId: string;
  approvalStatus: 'approved';
  sourceStatus: 'active';
  sourceTextVerified: true;
  evidenceText: string;
}>;

export type CourseProjection = Readonly<{
  organizationId: string;
  courseId: string;
  title: string;
  mode: 'online' | 'in_person' | 'residential' | 'hybrid';
  startsOn: string | null;
}>;

export type LeadProjection = Readonly<{
  organizationId: string;
  leadId: string;
  stage: string;
  lastActivityAt: string | null;
}>;

type OutputRecord = KnowledgeProjection | CourseProjection | LeadProjection;
export type ProjectionResult =
  | Readonly<{ ok: false; reason: string; mayExecute: false }>
  | Readonly<{
      ok: true;
      toolId: ResultToolId;
      organizationId: string;
      classification: 'untrusted_data_not_instructions';
      executionStatus: 'not_wired';
      records: readonly OutputRecord[];
      mayExecute: false;
    }>;

/** Own *data* properties only: prototype and accessor tricks must not run. */
function plain(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.values(descriptors).some(d => !Object.hasOwn(d, 'value'))) return null;
  if (Reflect.ownKeys(value).some(k => typeof k !== 'string')) return null;
  return value as Record<string, unknown>;
}

function exact(row: Record<string, unknown>, names: readonly string[]): boolean {
  return Reflect.ownKeys(row).length === names.length && names.every(n => Object.hasOwn(row, n));
}

function uuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

function bounded(value: unknown, maxBytes: number): value is string {
  return typeof value === 'string' && value === value.trim() &&
    Buffer.byteLength(value, 'utf8') > 0 && Buffer.byteLength(value, 'utf8') <= maxBytes &&
    !/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(value);
}

function validDay(value: unknown): boolean {
  if (value === null) return true;
  if (typeof value !== 'string' || !ISO_DAY.test(value)) return false;
  const date = new Date(value + 'T00:00:00.000Z');
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function validInstant(value: unknown): boolean {
  return value === null ||
    (typeof value === 'string' && ISO_INSTANT.test(value) && Number.isFinite(Date.parse(value)) &&
      new Date(value).toISOString() === value);
}

function projectRow(toolId: ResultToolId, scope: ResultScope, raw: unknown): OutputRecord | null {
  const r = plain(raw);
  if (!r || !uuid(r.organizationId) || r.organizationId !== scope.organizationId) return null;
  if (toolId === 'knowledge.approved.search') {
    if (!exact(r, ['organizationId', 'documentId', 'approvalStatus', 'sourceStatus',
      'sourceTextVerified', 'evidenceText']) || !uuid(r.documentId) ||
      r.approvalStatus !== 'approved' || r.sourceStatus !== 'active' ||
      r.sourceTextVerified !== true || !bounded(r.evidenceText, 768)) return null;
    return Object.freeze({
      organizationId: scope.organizationId,
      documentId: r.documentId,
      approvalStatus: 'approved' as const,
      sourceStatus: 'active' as const,
      sourceTextVerified: true as const,
      evidenceText: r.evidenceText,
    });
  }
  if (toolId === 'crm.course.list') {
    if (!exact(r, ['organizationId', 'courseId', 'title', 'mode', 'startsOn']) ||
      !uuid(r.courseId) || !bounded(r.title, 160) ||
      !['online', 'in_person', 'residential', 'hybrid'].includes(String(r.mode)) ||
      !validDay(r.startsOn)) return null;
    return Object.freeze({
      organizationId: scope.organizationId,
      courseId: r.courseId,
      title: r.title,
      mode: r.mode as CourseProjection['mode'],
      startsOn: r.startsOn as string | null,
    });
  }
  if (!exact(r, ['organizationId', 'leadId', 'stage', 'lastActivityAt']) ||
    !uuid(r.leadId) || r.leadId !== scope.leadId ||
    !bounded(r.stage, 64) || !validInstant(r.lastActivityAt)) return null;
  return Object.freeze({
    organizationId: scope.organizationId,
    leadId: r.leadId,
    stage: r.stage,
    lastActivityAt: r.lastActivityAt as string | null,
  });
}

/**
 * Projects a future server-owned, already-authorized query response into a
 * strict non-PII allowlist. Extra properties (phone, email, notes, tokens,
 * raw CRM rows, URLs, permissions) cause a complete denial, not a silent leak.
 *
 * This is a shaping check, NOT permission to use the records. The future
 * dispatcher must obtain scope from signed server context, not a model claim.
 * In particular the source-status booleans can be stale or forged and MUST be
 * independently checked in SQL before any Knowledge is retrieved.
 */
export function projectReadOnlyToolResultDraft(scopeValue: unknown, rowsValue: unknown): ProjectionResult {
  const fail = (reason: string): ProjectionResult => Object.freeze({
    ok: false, reason, mayExecute: false as const,
  });
  try {
    const s = plain(scopeValue);
    if (!s || !exact(s, ['toolId', 'organizationId', 'leadId']) ||
      typeof s.toolId !== 'string' || !TOOLS.includes(s.toolId as ResultToolId) ||
      !uuid(s.organizationId)) return fail('invalid_server_scope');
    const toolId = s.toolId as ResultToolId;
    if (toolId === 'crm.lead.read' ? !uuid(s.leadId) : s.leadId !== null) {
      return fail('invalid_resource_scope');
    }
    if (!Array.isArray(rowsValue)) return fail('invalid_result_set');
    const maxRows = toolId === 'knowledge.approved.search' ? 5 :
      toolId === 'crm.course.list' ? 20 : 1;
    if (rowsValue.length > maxRows) return fail('result_limit_exceeded');
    const scope = Object.freeze({
      toolId, organizationId: s.organizationId as string, leadId: s.leadId as string | null,
    });
    const output: OutputRecord[] = [];
    const seen = new Set<string>();
    for (const raw of rowsValue) {
      const row = projectRow(toolId, scope, raw);
      if (!row) return fail('result_not_safe');
      const id = 'documentId' in row ? row.documentId :
        'courseId' in row ? row.courseId : row.leadId;
      if (seen.has(id)) return fail('duplicate_result');
      seen.add(id);
      output.push(row);
    }
    return Object.freeze({
      ok: true as const,
      toolId,
      organizationId: scope.organizationId,
      classification: 'untrusted_data_not_instructions' as const,
      executionStatus: 'not_wired' as const,
      records: Object.freeze(output),
      mayExecute: false as const,
    });
  } catch {
    // Malformed proxies and hostile accessors must fail closed, not throw.
    return fail('invalid_result_set');
  }
}
