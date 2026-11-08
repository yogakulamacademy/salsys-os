'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { useMockData } from '@/lib/config';
import { createClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceContext } from '@/lib/workspace';

const destination = '/settings/knowledge';

function rejectDraft(reason: string): never {
  redirect(destination + '?draftError=' + encodeURIComponent(reason));
}

/**
 * A deliberately SEPARATE manual action. A discovered page supplies only
 * source metadata. A human enters the content; the resulting document is
 * ALWAYS A DRAFT and NEVER auto-approved or used by Co-Pilot retrieval.
 *
 * Form-controlled source URL/name, approval intent and tenant are ignored.
 */
export async function createManualDraftFromDiscoveredPageAction(formData: FormData) {
  if (useMockData || process.env.KNOWLEDGE_DISCOVERY_PILOT_ENABLED !== 'true' ||
      process.env.KNOWLEDGE_DISCOVERY_PAUSED === 'true' ||
      process.env.KNOWLEDGE_DISCOVERY_ATOMIC_DRAFT_APPROVED !== 'true') {
    rejectDraft('Discovery review is unavailable. No draft was created.');
  }

  const pageId = formData.get('page_id');
  const title = formData.get('title');
  const content = formData.get('content');
  const category = formData.get('category');

  if (typeof pageId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(pageId) ||
      typeof title !== 'string' || title.trim().length < 2 || title.trim().length > 180 ||
      typeof content !== 'string' || content.trim().length < 10 || content.trim().length > 20_000 ||
      typeof category !== 'string' ||
      !new Set(['general','faq','courses','pricing','batches','payments','accommodation',
        'travel','certification','recordings','refunds','transfers','cancellation',
        'online_course_rules','sales_scripts','objection_handling','health_escalation','policy'])
        .has(category)) {
    rejectDraft('Enter a valid title, category and manually reviewed content.');
  }

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) redirect('/login');

  const workspace = await getCurrentWorkspaceContext(supabase);
  const active = workspace.activeWorkspace;
  const organizationId = workspace.activeOrganizationId;
  if (!organizationId || !active || active.organizationId !== organizationId ||
      !['owner', 'admin'].includes(active.role)) {
    redirect('/dashboard?restricted=1');
  }
  const { data: mayManage, error: manageError } = await supabase
    .rpc('can_manage_organization', { p_organization_id: organizationId });
  if (manageError || mayManage !== true) {
    rejectDraft('Owner or admin permission could not be verified.');
  }

  // UI eligibility is NOT permission to create a discovered-page document:
  // consent and ownership may be revoked between that read and this write.
  // Require a NEW, independently reviewed SQL RPC that locks/current-checks
  // the session, tenant, stored website, page/job, ownership and purpose-
  // limited consent IN THE SAME TRANSACTION as draft creation. It is NOT
  // installed by this draft; missing RPC/permission must fail closed.
  // The original generic v2 source-backed RPC is deliberately NOT a
  // fallback because it does not recheck current discovery consent.
  const { data: creation, error } = await supabase.rpc(
    'create_discovery_review_draft_with_current_consent_v1', {
      p_organization_id: organizationId,
      p_page_id: pageId,
      p_title: title.trim(),
      p_category: category,
      p_content: content.trim(),
    },
  );

  // The new atomic function contract must return explicit, tenant-bound,
  // draft-only IDs. A transport success is not a saved-draft receipt.
  if (error || creation?.ok !== true || creation?.status !== 'draft' ||
      creation?.organization_id !== organizationId ||
      creation?.page_id !== pageId ||
      typeof creation.document_id !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(creation.document_id) ||
      typeof creation.source_id !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(creation.source_id)) {
    rejectDraft('A current owner-authorized, consent-checked draft write could not be verified. No approval was assumed.');
  }

  revalidatePath(destination);
  // The new draft appears in the existing tenant-scoped library on reload.
  // Never trust a caller-controlled GET parameter as proof of a saved document.
  redirect(destination);
}
