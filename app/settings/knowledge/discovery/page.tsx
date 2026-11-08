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
  searchParams: Promise<{ websiteError?: string }>;
}) {
  const workspace = await requireAdminWorkspaceAccess();
  const params = await searchParams;
  const canEditWebsite = process.env.KNOWLEDGE_DISCOVERY_PILOT_ENABLED !== 'true' &&
    process.env.KNOWLEDGE_DISCOVERY_CONSENT_MANAGEMENT_ENABLED !== 'true';
  // Website save status is read from the database, not a forgeable GET notice.
  // Query parameters may only select fixed, non-successful error text.
  const errors: Record<string, string> = {
    pilot_locked: 'Website changes are unavailable while discovery or consent management is configured.',
    invalid_input: 'Enter a public HTTPS website domain, up to 240 characters.',
    invalid_root: 'Use the HTTPS root of your public website, without a path.',
    invalid_public_host: 'Enter a valid public HTTPS website domain.',
    not_authorized: 'Owner or admin authorization could not be verified.',
    not_readable: 'Organization website could not be verified. No change was saved.',
    write_conflict: 'Website not saved. Your permissions or the organization website may have changed.',
  };
  return (
    <KnowledgeDiscoveryWorkspace
      key={workspace.organizationId}
      canEditWebsite={canEditWebsite}
      websiteError={errors[params.websiteError ?? ''] ?? ''}
    />
  );
}
