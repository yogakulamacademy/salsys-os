'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceContext } from '@/lib/workspace';
import { parseWebsiteSeed, WebsiteScopeError } from '@/lib/knowledge-discovery/url-policy';

const destination = '/settings/knowledge/discovery';

type WebsiteErrorCode =
  'pilot_locked' | 'invalid_input' | 'invalid_root' | 'invalid_public_host' |
  'not_authorized' | 'not_readable' | 'write_conflict';

function refuse(code: WebsiteErrorCode): never {
  redirect(destination + '?websiteError=' + code);
}

/**
 * Post-onboarding website editing, separate from onboarding progress.
 *
 * This never starts a scan, issues proof, grants consent, changes existing
 * knowledge, or resets completed onboarding. Site changes are disabled while
 * discovery/consent-grant pilots are configured, even if temporarily paused.
 */
export async function saveKnowledgeWebsiteAction(formData: FormData) {
  if (process.env.KNOWLEDGE_DISCOVERY_PILOT_ENABLED === 'true' ||
      process.env.KNOWLEDGE_DISCOVERY_CONSENT_MANAGEMENT_ENABLED === 'true') {
    refuse('pilot_locked');
  }

  const raw = formData.get('website');
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 240) {
    refuse('invalid_input');
  }

  let canonical: string;
  try {
    const url = parseWebsiteSeed(raw);
    if (url.protocol !== 'https:' || url.pathname !== '/') {
      refuse('invalid_root');
    }
    canonical = url.origin + '/';
  } catch (error) {
    if (error instanceof WebsiteScopeError) {
      refuse('invalid_public_host');
    }
    throw error;
  }

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) redirect('/login');

  const workspace = await getCurrentWorkspaceContext(supabase);
  const active = workspace.activeWorkspace;
  if (!active || !workspace.activeOrganizationId ||
      active.organizationId !== workspace.activeOrganizationId ||
      (active.role !== 'owner' && active.role !== 'admin')) {
    redirect('/dashboard?restricted=1');
  }

  const organizationId = workspace.activeOrganizationId;
  const { data: canManage, error: roleError } = await supabase.rpc(
    'can_manage_organization', { p_organization_id: organizationId },
  );
  if (roleError || canManage !== true) {
    refuse('not_authorized');
  }

  const { data: existing, error: readError } = await supabase
    .from('organization_onboarding')
    .select('website_url')
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (readError || !existing) {
    refuse('not_readable');
  }

  if (existing.website_url === canonical) {
    redirect(destination);
  }

  // Optimistic concurrency: an admin editing a stale profile cannot silently
  // overwrite a newer website saved by another admin/session.
  const updater = supabase.from('organization_onboarding')
    .update({ website_url: canonical })
    .eq('organization_id', organizationId);
  const guarded = existing.website_url === null
    ? updater.is('website_url', null)
    : updater.eq('website_url', existing.website_url);
  const { data: saved, error: writeError } = await guarded
    .select('organization_id,website_url')
    .maybeSingle();
  if (writeError || !saved || saved.organization_id !== organizationId ||
      saved.website_url !== canonical) {
    refuse('write_conflict');
  }

  // No change to onboarding.status, goals, knowledge_documents or proof/
  // consent rows. Existing proof and consent are host-bound and do not
  // automatically authorize the new website, even if this save succeeds.
  revalidatePath('/settings/knowledge');
  revalidatePath(destination);
  redirect(destination);
}
