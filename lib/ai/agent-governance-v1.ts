import 'server-only';

import { createHash } from 'node:crypto';

/**
 * AI-02 / P2: isolated, REVIEW-ONLY configuration contract.
 *
 * This module does not persist prompts, select a model, authorize callers,
 * grant privileges, invoke tools, publish content, or change existing
 * Co-Pilot/Knowledge actions. No production runtime imports it.
 *
 * Never promote a "preview eligible" result to live permission. A future
 * executor must separately verify current Auth session, tenant membership,
 * per-resource grants, signed approval and audit inside the database.
 */
export const AGENT_GOVERNANCE_EXECUTION_WIRED = false as const;

type CheckFailure = { ok: false; reason: string };
type CheckSuccess<T> = { ok: true; preview: T; mayExecute: false };
export type PreviewCheck<T> = CheckFailure | CheckSuccess<T>;

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const DIGEST = /^[a-f0-9]{64}$/;
const PROMPT_KEYS = ['admissions_router', 'admissions_reply', 'staff_insight'] as const;
const TONES = ['warm', 'professional', 'concise'] as const;
const LENGTHS = ['brief', 'balanced'] as const;
const LANGUAGES = ['en', 'hi', 'es', 'fr'] as const;

/**
 * Use a detached DATA-property snapshot for every untrusted draft/context.
 * Validation and decisions must not re-read a caller-owned getter or Proxy.
 * This is structural checking only, never server authentication.
 */
function record(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object') return null;
  try {
    if (Array.isArray(value)) return null;
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return null;
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
    return null;
  }
}

/**
 * Array.isArray alone is insufficient: nested arrays can have accessor
 * elements or Proxy traps. Copy exact dense own DATA entries only.
 */
function snapshotArray(value: unknown): readonly unknown[] | null {
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return null;
    const keys = Reflect.ownKeys(value);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const count = descriptors.length?.value;
    if (!Number.isSafeInteger(count) || count < 0 ||
      keys.length !== count + 1 || !Object.hasOwn(descriptors, 'length')) return null;
    const copy: unknown[] = [];
    for (let i = 0; i < count; i++) {
      const descriptor = descriptors[String(i)];
      if (!descriptor || !Object.hasOwn(descriptor, 'value') ||
        descriptor.enumerable !== true) return null;
      copy.push(descriptor.value);
    }
    return Object.freeze(copy);
  } catch {
    return null;
  }
}

function exactKeys(value: Record<string, unknown>, required: readonly string[]): boolean {
  const received = Object.keys(value);
  return received.length === required.length && required.every(key => Object.hasOwn(value, key));
}

function uuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

function validVersion(value: unknown): value is number {
  return Number.isSafeInteger(value) && typeof value === 'number' && value >= 1 && value <= 1000000;
}

function validTimestamp(value: unknown): value is string {
  return typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

const promptFields = [
  'schemaVersion', 'scope', 'promptKey', 'version', 'status',
  'promptText', 'sha256', 'authorId', 'createdAt',
] as const;

export type PromptDraftPreview = Readonly<{
  promptKey: typeof PROMPT_KEYS[number];
  version: number;
  sha256: string;
  createdAt: string;
  status: 'draft';
}>;

/**
 * A digest verifies the supplied text bytes only, NOT who wrote them,
 * independent approval, or authority to override the server system prompt.
 * "approved" status supplied by a caller is deliberately never accepted.
 */
export function inspectPlatformPromptDraft(value: unknown): PreviewCheck<PromptDraftPreview> {
  const row = record(value);
  if (!row || !exactKeys(row, promptFields) ||
    row.schemaVersion !== 1 || row.scope !== 'platform' || row.status !== 'draft' ||
    !PROMPT_KEYS.includes(row.promptKey as typeof PROMPT_KEYS[number]) ||
    !validVersion(row.version) || !uuid(row.authorId) || !validTimestamp(row.createdAt) ||
    typeof row.promptText !== 'string' ||
    row.promptText !== row.promptText.trim() ||
    Buffer.byteLength(row.promptText, 'utf8') < 40 ||
    Buffer.byteLength(row.promptText, 'utf8') > 12000 ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(row.promptText) ||
    typeof row.sha256 !== 'string' || !DIGEST.test(row.sha256) ||
    createHash('sha256').update(row.promptText, 'utf8').digest('hex') !== row.sha256) {
    return { ok: false, reason: 'invalid_or_untrusted_prompt_draft' };
  }
  return {
    ok: true,
    preview: Object.freeze({
      promptKey: row.promptKey as PromptDraftPreview['promptKey'],
      version: row.version,
      sha256: row.sha256,
      createdAt: row.createdAt,
      status: 'draft' as const,
    }),
    mayExecute: false,
  };
}

const guidanceFields = [
  'schemaVersion', 'scope', 'organizationId', 'authorId',
  'version', 'status', 'tone', 'responseLength',
  'languages', 'approvedKnowledgeDocumentIds',
] as const;

export type TenantGuidancePreview = Readonly<{
  organizationId: string;
  version: number;
  tone: typeof TONES[number];
  responseLength: typeof LENGTHS[number];
  languages: readonly string[];
  approvedKnowledgeDocumentIds: readonly string[];
  status: 'draft';
}>;

/**
 * Scoped choices and references, not executable free-form tenant prompts.
 * References are NOT evidence of approval: future DB retrieval must validate
 * every document and current source/consent status again. A caller-supplied
 * organization ID or role can never establish tenant authority.
 */
export function inspectTenantGuidanceDraft(
  value: unknown,
  activeOrganizationId: string,
): PreviewCheck<TenantGuidancePreview> {
  const row = record(value);
  const languages = snapshotArray(row?.languages);
  const knowledgeIds = snapshotArray(row?.approvedKnowledgeDocumentIds);
  if (!uuid(activeOrganizationId) || !row || !exactKeys(row, guidanceFields) ||
    row.schemaVersion !== 1 || row.scope !== 'tenant_guidance' ||
    row.organizationId !== activeOrganizationId ||
    !uuid(row.authorId) || !validVersion(row.version) || row.status !== 'draft' ||
    !TONES.includes(row.tone as typeof TONES[number]) ||
    !LENGTHS.includes(row.responseLength as typeof LENGTHS[number]) ||
    !languages || languages.length < 1 || languages.length > 3 ||
    !languages.every(language => LANGUAGES.includes(language as typeof LANGUAGES[number])) ||
    new Set(languages).size !== languages.length ||
    !knowledgeIds || knowledgeIds.length > 12 ||
    !knowledgeIds.every(uuid) ||
    new Set(knowledgeIds).size !== knowledgeIds.length) {
    return { ok: false, reason: 'invalid_tenant_guidance_draft' };
  }

  return {
    ok: true,
    preview: Object.freeze({
      organizationId: activeOrganizationId,
      version: row.version,
      tone: row.tone as TenantGuidancePreview['tone'],
      responseLength: row.responseLength as TenantGuidancePreview['responseLength'],
      languages: languages as readonly string[],
      approvedKnowledgeDocumentIds: knowledgeIds as readonly string[],
      status: 'draft' as const,
    }),
    mayExecute: false,
  };
}

const READ_ONLY_TOOLS = Object.freeze({
  'knowledge.approved.search': Object.freeze({ effect: 'read' as const, resource: 'knowledge' as const }),
  'crm.course.list': Object.freeze({ effect: 'read' as const, resource: 'course' as const }),
  'crm.lead.read': Object.freeze({ effect: 'read' as const, resource: 'lead' as const }),
});

export type ReadOnlyToolId = keyof typeof READ_ONLY_TOOLS;
const toolFields = ['toolId', 'organizationId', 'actorId', 'leadId'] as const;

export type VerifiedPreviewContext = Readonly<{
  organizationId: string;
  actorId: string;
  role: 'owner' | 'admin' | 'member';
  sessionVerified: boolean;
  membershipVerified: boolean;
  authorizedLeadId: string | null;
}>;

export type ReadOnlyToolPreview = Readonly<{
  toolId: ReadOnlyToolId;
  effect: 'read';
  organizationId: string;
  subjectLeadId: string | null;
  executionStatus: 'not_wired';
}>;

/**
 * Read-only PROPOSAL inspection, not an authorization function.
 * The verified context is a future server-caller's contract; it is not
 * itself verified here and MUST NOT be passed from the browser or LLM.
 * No generated RPC name, arbitrary endpoint, callback or mutation accepted.
 * Even a valid proposal can never execute from this module.
 */
export function inspectReadOnlyToolProposal(
  value: unknown,
  trustedContext: VerifiedPreviewContext,
): PreviewCheck<ReadOnlyToolPreview> {
  const row = record(value);
  const ctx = record(trustedContext);
  if (!row || !ctx || !exactKeys(row, toolFields) ||
    typeof row.toolId !== 'string' || !Object.hasOwn(READ_ONLY_TOOLS, row.toolId) ||
    !uuid(row.organizationId) || !uuid(row.actorId) ||
    !uuid(ctx.organizationId) || !uuid(ctx.actorId) ||
    row.organizationId !== ctx.organizationId || row.actorId !== ctx.actorId ||
    ctx.sessionVerified !== true || ctx.membershipVerified !== true ||
    // Never invoke untrusted toString(), valueOf(), or Symbol.toPrimitive.
    typeof ctx.role !== 'string' ||
    // For v1, only owner/admin proposals are even eligible for independent review.
    !['owner', 'admin'].includes(ctx.role)) {
    return { ok: false, reason: 'tool_proposal_not_eligible' };
  }

  const toolId = row.toolId as ReadOnlyToolId;
  if (toolId === 'crm.lead.read') {
    if (!uuid(row.leadId) || row.leadId !== ctx.authorizedLeadId) {
      return { ok: false, reason: 'lead_scope_not_verified' };
    }
  } else if (row.leadId !== null) {
    return { ok: false, reason: 'unexpected_resource_scope' };
  }

  return {
    ok: true,
    preview: Object.freeze({
      toolId,
      effect: READ_ONLY_TOOLS[toolId].effect,
      organizationId: ctx.organizationId as string,
      subjectLeadId: toolId === 'crm.lead.read' ? row.leadId as string : null,
      executionStatus: 'not_wired' as const,
    }),
    mayExecute: false,
  };
}

/** No toggling this via environment variables or model/tool output. */
export function agentGovernanceRuntimeAvailable(): false {
  return AGENT_GOVERNANCE_EXECUTION_WIRED;
}
