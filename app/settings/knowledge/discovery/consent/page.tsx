import { KnowledgeDiscoveryConsentWorkspace } from '@/components/knowledge-discovery-consent-workspace';
import { requireAdminWorkspaceAccess } from '@/lib/route-access';

export const dynamic = 'force-dynamic';

/** Owner/admin-only. Backend independently checks live tenant Auth session. */
export default async function KnowledgeDiscoveryConsentPage() {
  await requireAdminWorkspaceAccess();
  return <KnowledgeDiscoveryConsentWorkspace />;
}
