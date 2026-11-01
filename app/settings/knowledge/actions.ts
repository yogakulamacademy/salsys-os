'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { useMockData } from '@/lib/config';
import { createClient } from '@/lib/supabase/server';
import { requireCurrentOrganizationId } from '@/lib/workspace';

function textValue(formData: FormData, key: string) {
  return String(formData.get(key) ?? '').trim();
}

function knowledgeRedirect(type: 'notice' | 'error', message: string): never {
  redirect(`/settings/knowledge?${type}=${encodeURIComponent(message)}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
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

  const { supabase, organizationId } = await currentContext();
  const { error } = await supabase.rpc('create_knowledge_document_v1', {
    p_organization_id: organizationId,
    p_title: title,
    p_category: category,
    p_content: content,
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
      ? 'Knowledge approved and available to the Co-Pilot.'
      : 'Knowledge saved as a draft.',
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
  knowledgeRedirect('notice', 'Knowledge approved and available to the Co-Pilot.');
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
