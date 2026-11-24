import 'server-only';
import { requirePlatformAdminAccess } from '@/lib/platform-admin-access';
import { createAdminClient } from '@/lib/supabase/admin';

export type PlatformOrganizationSummary = {
  registeredNonPlatformOrganizations: number;
  activeNonPlatformOrganizations: number;
  completedNonPlatformOnboardingRecords: number;
};

function checkedCount(result: { count: number | null; error: unknown }): number {
  const count = result.count;
  if (result.error || typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) {
    throw new Error('Organization summary unavailable.');
  }
  return count;
}

export async function loadPlatformOrganizationSummary(): Promise<PlatformOrganizationSummary> {
  if (process.env.SALSYS_PLATFORM_ADMIN_ENABLED !== 'true') throw new Error('Platform overview unavailable.');
  const { activeWorkspace } = await requirePlatformAdminAccess();
  const platformId = activeWorkspace.organizationId;
  const admin = createAdminClient();
  // Exact head-only counts; do not fetch customer rows or business records.
  // Registry counts include demo and legacy tenants; they are not paid customers.
  const [registered, active, onboarded] = await Promise.all([
    admin.from('organizations').select('id', { count: 'exact', head: true }).neq('id', platformId),
    admin.from('organizations').select('id', { count: 'exact', head: true }).neq('id', platformId).eq('status', 'active'),
    admin.from('organization_onboarding').select('organization_id', { count: 'exact', head: true }).neq('organization_id', platformId).eq('status', 'completed'),
  ]);
  const registeredCount = checkedCount(registered);
  const activeCount = checkedCount(active);
  const completedCount = checkedCount(onboarded);
  if (activeCount > registeredCount || completedCount > registeredCount) throw new Error('Organization summary inconsistent.');
  return {
    registeredNonPlatformOrganizations: registeredCount,
    activeNonPlatformOrganizations: activeCount,
    completedNonPlatformOnboardingRecords: completedCount,
  };
}
