import 'server-only';
import { requirePlatformAdminAccess } from '@/lib/platform-admin-access';
import { createAdminClient } from '@/lib/supabase/admin';

const statuses = ['not_started','in_progress','completed','dismissed'] as const;
type Status = typeof statuses[number];
export type PlatformOnboardingSummary = {
  registered: number;
  recorded: Record<Status,number>;
  missingRecords: number;
  enforcedIncomplete: number;
};
function countOf(result: {count:number|null;error:unknown}):number {
  if (result.error || typeof result.count !== 'number' || !Number.isSafeInteger(result.count) || result.count < 0)
    throw new Error('Onboarding monitoring unavailable.');
  return result.count;
}
export async function loadPlatformOnboardingSummary():Promise<PlatformOnboardingSummary> {
  if (process.env.SALSYS_PLATFORM_ADMIN_ENABLED !== 'true') throw new Error('Platform overview unavailable.');
  const {activeWorkspace} = await requirePlatformAdminAccess();
  const admin = createAdminClient();
  const base = () => admin.from('organization_onboarding').select('organization_id',{count:'exact',head:true}).neq('organization_id',activeWorkspace.organizationId);
  const [registry,all,...counts] = await Promise.all([
    admin.from('organizations').select('id',{count:'exact',head:true}).neq('id',activeWorkspace.organizationId),
    base(),
    ...statuses.map(status=>base().eq('status',status)),
    base().eq('enforce_on_sign_in',true).neq('status','completed'),
  ]);
  const registered = countOf(registry);
  const total = countOf(all);
  const recorded = Object.fromEntries(statuses.map((status,i)=>[status,countOf(counts[i])])) as Record<Status,number>;
  const enforcedIncomplete = countOf(counts[statuses.length]);
  if (total > registered || Object.values(recorded).reduce((a,b)=>a+b,0) !== total || enforcedIncomplete > total-recorded.completed)
    throw new Error('Onboarding counts inconsistent; refresh.');
  return {registered,recorded,missingRecords:registered-total,enforcedIncomplete};
}
