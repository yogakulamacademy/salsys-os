import 'server-only';

import {
  projectReadOnlyToolResultDraft,
  type ProjectionResult,
} from './read-only-tool-result-projection-v1';

/**
 * AI-09F — Real-schema *shape* adapter, not a database reader.
 * It works with narrow SELECT projections from the actual public.courses,
 * public.course_batches and public.leads schema, never raw ORM rows.
 *
 * HARD STOP: the approved Knowledge retrieval path needs source-metadata,
 * signed consent, revision/withdrawal, and independent policy review. There
 * is intentionally no Knowledge adapter in this checkpoint.
 *
 * This module performs no Auth, RLS, SQL, audit, model or tool calls.
 * No runtime code imports it. No successful result permits execution.
 */
export const REAL_SCHEMA_READ_ADAPTER_RUNTIME_WIRED = false as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const STAGES = new Set([
  'new', 'contacted', 'engaged', 'qualified', 'high_intent',
  'payment_pending', 'enrolled', 'nurture', 'not_now',
  'lost', 'unqualified', 'duplicate',
]);

type CandidateScope = Readonly<{ toolId: string; organizationId: string; leadId: string | null }>;
export type SourceShapeResult = ProjectionResult |
  Readonly<{ ok: false; reason: 'knowledge_policy_unresolved' | 'invalid_real_schema_shape'; mayExecute: false }>;

function ownRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const p = Object.getPrototypeOf(value);
  if (p !== Object.prototype && p !== null) return null;
  if (Reflect.ownKeys(value).some(k => typeof k !== 'string')) return null;
  const desc = Object.getOwnPropertyDescriptors(value);
  if (Object.values(desc).some(d => !Object.hasOwn(d, 'value'))) return null;
  return value as Record<string, unknown>;
}
function exact(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Reflect.ownKeys(value).length === keys.length &&
    keys.every(k => Object.hasOwn(value, k));
}
function uuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

function deny(reason: 'knowledge_policy_unresolved' | 'invalid_real_schema_shape'): SourceShapeResult {
  return Object.freeze({ ok: false, reason, mayExecute: false as const });
}

/**
 * *Only* known selected columns from tenant-filtered public.courses and
 * public.course_batches. Real mode lives on course_batches, NOT courses.
 *
 * A course may have multiple batches; future policy must decide how to
 * represent them and enforce Education Core capability in SQL. This preview
 * supports only one supplied active batch per course and denies duplicates.
 *
 * Never accept a model-supplied "capability_enabled" or org role as proof.
 */
export function projectRealSchemaReadPreview(
  scopeValue: unknown,
  rowsValue: unknown,
): SourceShapeResult {
  try {
    const s = ownRecord(scopeValue);
    if (!s || !exact(s, ['toolId', 'organizationId', 'leadId']) ||
      !uuid(s.organizationId) || typeof s.toolId !== 'string' ||
      (s.toolId !== 'crm.course.list' && s.toolId !== 'crm.lead.read' &&
       s.toolId !== 'knowledge.approved.search')) {
      return deny('invalid_real_schema_shape');
    }
    const scope = s as CandidateScope;

    // Current canonical Knowledge search lacks source metadata, so even
    // "approved" rows cannot establish a current, verified consent chain.
    if (scope.toolId === 'knowledge.approved.search') {
      return deny('knowledge_policy_unresolved');
    }

    if (!Array.isArray(rowsValue)) return deny('invalid_real_schema_shape');
    if (scope.toolId === 'crm.lead.read') {
      if (!uuid(scope.leadId) || rowsValue.length !== 1) {
        return deny('invalid_real_schema_shape');
      }
      const r = ownRecord(rowsValue[0]);
      if (!r || !exact(r, ['id', 'organization_id', 'current_stage']) ||
        r.organization_id !== scope.organizationId || r.id !== scope.leadId ||
        typeof r.current_stage !== 'string' || !STAGES.has(r.current_stage)) {
        return deny('invalid_real_schema_shape');
      }
      // updated_at does NOT mean lastActivityAt. The actual lead's
      // latest activity requires separate verified per-tenant joins, so null.
      return projectReadOnlyToolResultDraft(scope, [{
        organizationId: scope.organizationId,
        leadId: r.id,
        stage: r.current_stage,
        lastActivityAt: null,
      }]);
    }

    if (scope.leadId !== null || rowsValue.length > 20) {
      return deny('invalid_real_schema_shape');
    }

    const output = [];
    const seen = new Set<string>();
    for (const raw of rowsValue) {
      const item = ownRecord(raw);
      if (!item || !exact(item, ['course', 'batch'])) {
        return deny('invalid_real_schema_shape');
      }
      const c = ownRecord(item.course);
      const b = ownRecord(item.batch);
      if (!c || !b ||
        !exact(c, ['id', 'organization_id', 'name', 'active']) ||
        !exact(b, ['id', 'organization_id', 'course_id', 'mode', 'start_date', 'active']) ||
        !uuid(c.id) || !uuid(b.id) ||
        c.organization_id !== scope.organizationId ||
        b.organization_id !== scope.organizationId ||
        b.course_id !== c.id ||
        c.active !== true || b.active !== true ||
        typeof c.name !== 'string' || c.name !== c.name.trim() ||
        Buffer.byteLength(c.name, 'utf8') < 1 ||
        Buffer.byteLength(c.name, 'utf8') > 160 ||
        typeof b.mode !== 'string' ||
        !['residential', 'online', 'non_residential', 'hybrid'].includes(b.mode)) {
        return deny('invalid_real_schema_shape');
      }
      if (seen.has(c.id)) return deny('invalid_real_schema_shape');
      seen.add(c.id);
      // The actual batch mode has "non_residential"; the safe output
      // uses "in_person" as a display category, not a DB enum value.
      const mappedMode = b.mode === 'non_residential' ? 'in_person' : b.mode;
      output.push({
        organizationId: scope.organizationId,
        courseId: c.id,
        title: c.name,
        mode: mappedMode,
        startsOn: b.start_date,
      });
    }
    return projectReadOnlyToolResultDraft(scope, output);
  } catch {
    // Proxy traps, malformed data, invalid dates and unexpected objects
    // cannot leak arbitrary raw records.
    return deny('invalid_real_schema_shape');
  }
}
