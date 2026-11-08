'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { useMockData } from '@/lib/config';
import { createClient } from '@/lib/supabase/server';
import { requireCurrentOrganizationId } from '@/lib/workspace';
import { inspectKnowledgeMatches } from '@/lib/knowledge-evidence';
import { discoveryApprovalPreflight } from '@/lib/knowledge-discovery/discovery-approval-preflight';

export type KnowledgePreviewResult = { state: 'idle' | 'error' | 'empty' | 'matched'; message: string; matches?: Array<{ documentId: string; title: string; version: number | null; validUntil: string | null; excerpt: string }> };

const sourceTypes = new Set([
  'manual',
  'website',
  'pdf',
  'drive',
  'faq',
  'policy',
  'course',
  'crm_reply',
  'other',
]);

/** Read-only preview of the same approved, current tenant retrieval used by Co-Pilot. */
export async function previewKnowledgeAction(formData: FormData): Promise<KnowledgePreviewResult> {
  if (useMockData) return { state: 'error', message: 'Demo mode does not run live knowledge retrieval.' };
  const raw = formData.get('query');
  if (typeof raw !== 'string' || !raw.trim() || raw.trim().length > 500) return { state: 'error', message: 'Enter a question between 1 and 500 characters.' };
  const { supabase, organizationId } = await currentContext();
  try {
    const { data, error } = await supabase.rpc('search_organization_knowledge_v1', { p_organization_id: organizationId, p_query: raw.trim(), p_limit: 6 });
    if (error) return { state: 'error', message: 'Knowledge retrieval is unavailable. Retry; this is not a no-match result.' };
    const checked = inspectKnowledgeMatches(data);
    if (!checked.ok) return { state: 'error', message: checked.error };
    if (!checked.matches.length) return { state: 'empty', message: 'No approved, currently eligible knowledge matched this question. Add or review a source-backed answer; this does not prove the answer is absent from your business.' };
    return { state: 'matched', message: 'Approved knowledge retrieved. This preview makes no AI call and sends no message.', matches: checked.matches.map(match => ({ documentId: match.document_id, title: match.title, version: checked.evidence.find(e => e.documentId === match.document_id)?.version ?? null, validUntil: match.valid_until, excerpt: match.content.slice(0, 600) })) };
  } catch {
    return { state: 'error', message: 'Knowledge retrieval is unavailable. Retry; this is not a no-match result.' };
  }
}

function textValue(formData: FormData, key: string) {
  return String(formData.get(key) ?? '').trim();
}

function knowledgeRedirect(type: 'notice' | 'error', message: string): never {
  redirect(`/settings/knowledge?${type}=${encodeURIComponent(message)}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function optionalSourceUrl(raw: string) {
  if (!raw) return null;
  if (raw.length > 2048) knowledgeRedirect('error', 'Source reference URL must be 2048 characters or fewer.');

  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      knowledgeRedirect('error', 'Source reference URL must use http or https.');
    }
    return parsed.toString();
  } catch {
    knowledgeRedirect('error', 'Enter a valid http or https source reference URL.');
  }
}

function optionalUtcDateTime(raw: string, label: string) {
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)) {
    knowledgeRedirect('error', `${label} must be a valid UTC date and time.`);
  }

  const timestamp = Date.parse(`${raw}:00.000Z`);
  if (!Number.isFinite(timestamp)) {
    knowledgeRedirect('error', `${label} must be a valid UTC date and time.`);
  }

  return new Date(timestamp).toISOString();
}

async function currentContext() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    knowledgeRedirect('error', 'Your session has expired. Sign in again.');
  }

  const organizationId = await requireCurrentOrganizationId(supabase, user.id);

  const { data: canManage, error: manageError } = await supabase.rpc(
    'can_manage_organization',
    { p_organization_id: organizationId },
  );

  if (manageError || canManage !== true) {
    knowledgeRedirect('error', 'Only organization admins can manage AI knowledge.');
  }

  return { supabase, organizationId };
}

export async function createKnowledgeDocumentAction(formData: FormData) {
  if (useMockData) {
    knowledgeRedirect('error', 'Mock mode is active. Knowledge was not changed.');
  }

  const title = textValue(formData, 'title');
  const category = textValue(formData, 'category') || 'general';
  const content = textValue(formData, 'content');
  const sourceName = textValue(formData, 'source_name');
  const sourceType = textValue(formData, 'source_type').toLowerCase() || 'manual';
  const sourceUri = optionalSourceUrl(textValue(formData, 'source_uri'));
  const validFrom = optionalUtcDateTime(textValue(formData, 'valid_from'), 'Valid from');
  const validUntil = optionalUtcDateTime(textValue(formData, 'valid_until'), 'Valid until');
  const intent = textValue(formData, 'intent');
  const approveNow = intent === 'approve';

  if (!title) {
    knowledgeRedirect('error', 'Knowledge title is required.');
  }

  if (title.length > 180) {
    knowledgeRedirect('error', 'Knowledge title must be 180 characters or fewer.');
  }

  if (!content || content.length < 10) {
    knowledgeRedirect('error', 'Knowledge content must be at least 10 characters.');
  }

  if (!sourceName) {
    knowledgeRedirect('error', 'Knowledge source name is required.');
  }

  if (sourceName.length > 240) {
    knowledgeRedirect('error', 'Knowledge source name must be 240 characters or fewer.');
  }

  if (!sourceTypes.has(sourceType)) {
    knowledgeRedirect('error', 'Select a supported knowledge source type.');
  }

  if (validFrom && validUntil && Date.parse(validUntil) <= Date.parse(validFrom)) {
    knowledgeRedirect('error', 'Valid until must be later than valid from.');
  }

  const { supabase, organizationId } = await currentContext();
  const { error } = await supabase.rpc('create_source_backed_knowledge_document_v2', {
    p_organization_id: organizationId,
    p_title: title,
    p_category: category,
    p_content: content,
    p_source_name: sourceName,
    p_source_type: sourceType,
    p_source_uri: sourceUri,
    p_valid_from: validFrom,
    p_valid_until: validUntil,
    p_approve: approveNow,
  });

  if (error) {
    knowledgeRedirect('error', error.message || 'Unable to save knowledge.');
  }

  revalidatePath('/settings/knowledge');
  revalidatePath('/conversations');

  knowledgeRedirect(
    'notice',
    approveNow
      ? 'Source-backed knowledge approved and available to the Co-Pilot when currently valid.'
      : 'Source-backed knowledge saved as a draft.',
  );
}

export async function approveKnowledgeDocumentAction(formData: FormData) {
  if (useMockData) {
    knowledgeRedirect('error', 'Mock mode is active. Knowledge was not changed.');
  }

  const documentId = textValue(formData, 'document_id');

  if (!documentId) {
    knowledgeRedirect('error', 'Knowledge document is required.');
  }

  const { supabase, organizationId } = await currentContext();
  // KB-14B: read-only, tenant-scoped discovery publication preflight in a
  // separate helper. Keep every write in the existing atomic Knowledge RPC.
  // The helper is NOT a safe replacement for the uninstalled DB-level guard:
  // the legacy RPC can be called directly, and a SELECT is not a lock.
  const publication = await discoveryApprovalPreflight(supabase, organizationId, documentId);
  if (publication === 'unreadable') {
    knowledgeRedirect('error', 'Knowledge cannot be verified for approval. No approval was attempted.');
  }
  if (publication === 'held') {
    knowledgeRedirect('error', 'Discovered-page drafts are held for independent evidence review and cannot be approved yet.');
  }

  const { data, error } = await supabase.rpc('approve_knowledge_document_v1', {
    p_organization_id: organizationId,
    p_document_id: documentId,
  });

  if (error) {
    knowledgeRedirect('error', error.message);
  }

  if (isRecord(data) && data.already_approved === true) {
    knowledgeRedirect('notice', 'Knowledge is already approved.');
  }

  revalidatePath('/settings/knowledge');
  revalidatePath('/conversations');
  knowledgeRedirect('notice', 'Knowledge approved and available to the Co-Pilot when currently valid.');
}

export async function archiveKnowledgeDocumentAction(formData: FormData) {
  if (useMockData) {
    knowledgeRedirect('error', 'Mock mode is active. Knowledge was not changed.');
  }

  const documentId = textValue(formData, 'document_id');

  if (!documentId) {
    knowledgeRedirect('error', 'Knowledge document is required.');
  }

  const { supabase, organizationId } = await currentContext();
  const { data, error } = await supabase.rpc('archive_knowledge_document_v1', {
    p_organization_id: organizationId,
    p_document_id: documentId,
  });

  if (error) {
    knowledgeRedirect('error', error.message);
  }

  if (isRecord(data) && data.already_archived === true) {
    knowledgeRedirect('notice', 'Knowledge is already archived.');
  }

  revalidatePath('/settings/knowledge');
  revalidatePath('/conversations');
  knowledgeRedirect('notice', 'Knowledge archived and removed from AI retrieval.');
}
