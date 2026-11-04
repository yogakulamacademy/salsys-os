import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentWorkspaceContext } from '@/lib/workspace';
import { useMockData } from '@/lib/config';
import { parsePilotEvidenceDraft, type PilotEvidenceDraftInput } from '@/lib/ai/pilot-evidence-validation';

export type PilotEvidenceDraft = PilotEvidenceDraftInput & {
  created_at: string;
};

type OwnerContext = { organizationId: string; userId: string; organizationName: string };

/**
 * Fresh authenticated user, active workspace and live membership must all
 * agree on an owner role BEFORE any service-role access. No supplied tenant IDs.
 */
async function currentOwner(): Promise<OwnerContext | null> {
  if (useMockData) return null;
  const session = await createClient();
  const { data: { user }, error: authError } = await session.auth.getUser();
  if (authError || !user?.id) return null;

  const workspace = await getCurrentWorkspaceContext(session);
  const organizationId = workspace.activeOrganizationId;
  const activeWorkspace = workspace.activeWorkspace;
  if (!organizationId || !activeWorkspace ||
      activeWorkspace.organizationId !== organizationId ||
      activeWorkspace.role !== 'owner') return null;

  const { data: membership, error } = await session.from('organization_members')
    .select('role,active')
    .eq('organization_id', organizationId)
    .eq('user_id', user.id)
    .eq('active', true)
    .maybeSingle();
  if (error || !membership || membership.active !== true || membership.role !== 'owner') return null;

  return {
    organizationId,
    userId: user.id,
    organizationName: activeWorkspace.organizationName,
  };
}

export async function getPilotEvidenceDraft(): Promise<{
  organizationName: string;
  latest: PilotEvidenceDraft | null;
} | null> {
  const owner = await currentOwner();
  if (!owner) return null;

  const { data, error } = await createAdminClient()
    .from('ai_lead_insight_review_packet_drafts')
    .select('created_at,privacy_ref,retention_ref,provider_budget_ref,quality_review_ref')
    .eq('organization_id', owner.organizationId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw Error('The draft review packet is temporarily unavailable.');
  return { organizationName: owner.organizationName, latest: data ?? null };
}

/**
 * Append only: saving a draft never writes ai_lead_insight_pilot_approvals,
 * changes tenant opt-in, or calls an AI provider.
 */
export async function savePilotEvidenceDraft(input: Record<string, unknown>): Promise<void> {
  const owner = await currentOwner();
  if (!owner) throw Error('This action requires the current organization owner.');

  const draft = parsePilotEvidenceDraft(input);
  const { data, error } = await createAdminClient()
    .from('ai_lead_insight_review_packet_drafts')
    .insert({
      organization_id: owner.organizationId,
      authored_by: owner.userId,
      policy_version: 'lead_insight_pilot_v1',
      ...draft,
    })
    .select('id').single();

  if (error || !data?.id) throw Error('The draft could not be saved. No approval was recorded.');
}
