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

  return { supabase, user, organizationId };
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

  if (!content || content.length < 10) {
    knowledgeRedirect('error', 'Knowledge content must be at least 10 characters.');
  }

  const { supabase, user, organizationId } = await currentContext();
  const now = new Date().toISOString();

  const { data: document, error: documentError } = await supabase
    .from('knowledge_documents')
    .insert({
      organization_id: organizationId,
      title,
      category,
      content,
      status: approveNow ? 'approved' : 'draft',
      approved_by: approveNow ? user.id : null,
      approved_at: approveNow ? now : null,
      created_by: user.id,
      metadata: {
        entry_mode: 'manual',
      },
    })
    .select('id')
    .single();

  if (documentError || !document?.id) {
    knowledgeRedirect('error', documentError?.message || 'Unable to save knowledge.');
  }

  const { error: chunkError } = await supabase.from('knowledge_chunks').insert({
    organization_id: organizationId,
    document_id: document.id,
    chunk_index: 0,
    content,
    metadata: {
      source: 'document_content_v1',
    },
  });

  if (chunkError) {
    await supabase.from('knowledge_documents').delete().eq('id', document.id);
    knowledgeRedirect('error', `Knowledge chunk could not be created: ${chunkError.message}`);
  }

  if (approveNow) {
    const { error: approvalError } = await supabase
      .from('knowledge_approvals')
      .insert({
        organization_id: organizationId,
        document_id: document.id,
        action: 'approved',
        reviewer_id: user.id,
        note: 'Approved during manual knowledge creation.',
      });

    if (approvalError) {
      knowledgeRedirect('error', `Knowledge was created, but the approval audit failed: ${approvalError.message}`);
    }
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

  const { supabase, user, organizationId } = await currentContext();
  const now = new Date().toISOString();

  const { data: document, error: documentError } = await supabase
    .from('knowledge_documents')
    .select('id, status, content')
    .eq('organization_id', organizationId)
    .eq('id', documentId)
    .maybeSingle();

  if (documentError || !document) {
    knowledgeRedirect('error', documentError?.message || 'Knowledge document was not found.');
  }

  if (document.status === 'approved') {
    knowledgeRedirect('notice', 'Knowledge is already approved.');
  }

  const { error: updateError } = await supabase
    .from('knowledge_documents')
    .update({
      status: 'approved',
      approved_by: user.id,
      approved_at: now,
    })
    .eq('organization_id', organizationId)
    .eq('id', documentId);

  if (updateError) {
    knowledgeRedirect('error', updateError.message);
  }

  const { count: chunkCount } = await supabase
    .from('knowledge_chunks')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .eq('document_id', documentId);

  if (!chunkCount) {
    const { error: chunkError } = await supabase.from('knowledge_chunks').insert({
      organization_id: organizationId,
      document_id: documentId,
      chunk_index: 0,
      content: document.content,
      metadata: {
        source: 'document_content_v1',
      },
    });

    if (chunkError) {
      knowledgeRedirect('error', `Knowledge approved, but retrieval indexing failed: ${chunkError.message}`);
    }
  }

  const { error: approvalError } = await supabase
    .from('knowledge_approvals')
    .insert({
      organization_id: organizationId,
      document_id: documentId,
      action: 'approved',
      reviewer_id: user.id,
      note: 'Approved from the Knowledge workspace.',
    });

  if (approvalError) {
    knowledgeRedirect('error', `Knowledge approved, but the audit record failed: ${approvalError.message}`);
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

  const { supabase, user, organizationId } = await currentContext();

  const { error } = await supabase
    .from('knowledge_documents')
    .update({ status: 'archived' })
    .eq('organization_id', organizationId)
    .eq('id', documentId);

  if (error) {
    knowledgeRedirect('error', error.message);
  }

  const { error: auditError } = await supabase.from('knowledge_approvals').insert({
    organization_id: organizationId,
    document_id: documentId,
    action: 'archived',
    reviewer_id: user.id,
    note: 'Archived from the Knowledge workspace.',
  });

  if (auditError) {
    knowledgeRedirect('error', `Knowledge archived, but the audit record failed: ${auditError.message}`);
  }

  revalidatePath('/settings/knowledge');
  revalidatePath('/conversations');
  knowledgeRedirect('notice', 'Knowledge archived and removed from AI retrieval.');
}
