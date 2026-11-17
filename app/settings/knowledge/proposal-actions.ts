'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { runKnowledgeProposals } from '@/lib/ai-knowledge-proposals-runner';
import { useMockData } from '@/lib/config';
import { hasPlaceholders } from '@/lib/knowledge-proposals';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { requireCurrentOrganizationId } from '@/lib/workspace';

function back(type: 'notice' | 'error', message: string): never {
  redirect(`/settings/knowledge?${type}=${encodeURIComponent(message)}#suggested-updates`);
}

async function adminContext() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) back('error', 'Your session has expired. Sign in again.');
  const organizationId = await requireCurrentOrganizationId(supabase, user.id);
  const { data: canManage, error: manageError } = await supabase.rpc('can_manage_organization', { p_organization_id: organizationId });
  if (manageError || canManage !== true) back('error', 'Only organization admins can review AI suggestions.');
  return { supabase, organizationId };
}

/** Approve (optionally with edited text) or reject one AI suggestion. */
export async function decideKnowledgeProposalAction(formData: FormData) {
  if (useMockData) back('error', 'Demo mode: knowledge was not changed.');
  const proposalId = String(formData.get('proposal_id') ?? '').trim();
  const decision = String(formData.get('decision') ?? '');
  const content = String(formData.get('content') ?? '').trim();
  const note = String(formData.get('note') ?? '').trim().slice(0, 600);
  if (!/^[0-9a-f-]{36}$/i.test(proposalId)) back('error', 'Suggestion not found.');
  if (decision !== 'approve' && decision !== 'reject') back('error', 'Choose approve or reject.');
  if (decision === 'approve' && content && hasPlaceholders(content)) {
    back('error', 'Fill in every [ADD: …] gap before approving, or reject the suggestion.');
  }
  const { supabase } = await adminContext();
  const { data, error } = await supabase.rpc('decide_ai_knowledge_proposal_v1', {
    p_proposal_id: proposalId,
    p_decision: decision,
    p_edited_content: decision === 'approve' && content ? content : null,
    p_note: note || null,
  });
  if (error) back('error', error.message);
  const outcome = (data as { outcome?: string } | null)?.outcome;
  revalidatePath('/settings/knowledge');
  if (outcome === 'approved') {
    revalidatePath('/conversations');
    back('notice', 'Approved. AI drafts can use this knowledge now.');
  }
  if (outcome === 'rejected') back('notice', 'Suggestion rejected. Nothing changed.');
  if (outcome === 'expired') back('notice', 'That knowledge changed since the suggestion was made, so the suggestion expired.');
  back('notice', 'This suggestion was already decided.');
}

/** Admin-triggered run for the current organization only. */
export async function findKnowledgeSuggestionsAction() {
  if (useMockData) back('error', 'Demo mode: no AI call was made.');
  const { organizationId } = await adminContext();
  const admin = createAdminClient();
  const { data: recent } = await admin
    .from('ai_knowledge_proposals')
    .select('created_at')
    .eq('organization_id', organizationId)
    .gte('created_at', new Date(Date.now() - 30 * 60_000).toISOString())
    .limit(1);
  if (recent?.length) back('notice', 'Suggestions were made in the last 30 minutes. Review those first.');
  let summary: Awaited<ReturnType<typeof runKnowledgeProposals>>;
  try {
    summary = await runKnowledgeProposals(admin, organizationId);
  } catch {
    back('error', 'Could not look for suggestions right now. Try again later.');
  }
  revalidatePath('/settings/knowledge');
  if (!summary.claudeConfigured) back('error', 'Claude is not configured for this workspace.');
  if (summary.created > 0) back('notice', `${summary.created} new suggestion${summary.created === 1 ? '' : 's'} to review.`);
  if (summary.topics === 0) back('notice', 'No topic was asked by 3 or more leads in the last 14 days.');
  back('notice', `Checked ${summary.topics} common topics. No new changes needed${summary.errors ? ` (${summary.errors} could not be checked)` : ''}.`);
}
