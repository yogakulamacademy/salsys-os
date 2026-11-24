import 'server-only';
import { requirePlatformAdminAccess } from '@/lib/platform-admin-access';
import { createAdminClient } from '@/lib/supabase/admin';

const statuses = ['trialing', 'active', 'past_due', 'canceled', 'expired'] as const;
type Status = typeof statuses[number];
export type PlatformSubscriptionSummary = {
  total: number;
  recorded: Record<Status, number>;
  trialDeadlinePassed: number;
  activePeriodEnded: number;
  observedAt: string;
};

function countOf(result: { count: number | null; error: unknown }): number {
  const count = result.count;
  if (result.error || typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0)
    throw new Error('Subscription monitoring unavailable.');
  return count;
}

export async function loadPlatformSubscriptionSummary(): Promise<PlatformSubscriptionSummary> {
  if (process.env.SALSYS_PLATFORM_ADMIN_ENABLED !== 'true') throw new Error('Platform overview unavailable.');
  const { activeWorkspace } = await requirePlatformAdminAccess();
  const admin = createAdminClient();
  const observedAt = new Date().toISOString();
  const base = () => admin.from('saas_organization_subscriptions')
    .select('id', { count: 'exact', head: true }).neq('organization_id', activeWorkspace.organizationId);
  const [totalResult, ...counts] = await Promise.all([
    base(),
    ...statuses.map(status => base().eq('status', status)),
    base().eq('status', 'trialing').lte('trial_ends_at', observedAt),
    base().eq('status', 'active').lte('current_period_ends_at', observedAt),
  ]);
  const total = countOf(totalResult);
  const recorded = Object.fromEntries(statuses.map((status, index) => [status, countOf(counts[index])])) as Record<Status, number>;
  const trialDeadlinePassed = countOf(counts[statuses.length]);
  const activePeriodEnded = countOf(counts[statuses.length + 1]);
  if (Object.values(recorded).reduce((a, b) => a + b, 0) !== total ||
      trialDeadlinePassed > recorded.trialing || activePeriodEnded > recorded.active)
    throw new Error('Subscription monitoring inconsistent; refresh.');
  return { total, recorded, trialDeadlinePassed, activePeriodEnded, observedAt };
}
