import { KnowledgeDiscoveryWorkspace } from '@/components/knowledge-discovery-workspace';
import { requireAdminWorkspaceAccess } from '@/lib/route-access';

export const dynamic = 'force-dynamic';

/**
 * Permanent owner/admin Knowledge Builder access, during AND after onboarding.
 * The active tenant key prevents a previous organization's client state from
 * being reused when navigation switches the workspace.
 */
export default async function KnowledgeDiscoveryPage({
  searchParams,
}: {
  searchParams: Promise<{ websiteNotice?: string; websiteError?: string }>;
}) {
  const workspace = await requireAdminWorkspaceAccess();
  const params = await searchParams;
  const canEditWebsite = process.env.KNOWLEDGE_DISCOVERY_PILOT_ENABLED !== 'true' &&
    process.env.KNOWLEDGE_DISCOVERY_CONSENT_MANAGEMENT_ENABLED !== 'true';
  return (
    <KnowledgeDiscoveryWorkspace
      key={workspace.organizationId}
      canEditWebsite={canEditWebsite}
      websiteNotice={params.websiteNotice?.slice(0, 240) ?? ''}
      websiteError={params.websiteError?.slice(0, 240) ?? ''}
    />
  );
}
