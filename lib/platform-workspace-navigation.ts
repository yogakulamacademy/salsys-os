import 'server-only';
import { readPlanReviewState } from '@/lib/commercial/plan-admin';
import { createClient } from '@/lib/supabase/server';
import { useMockData } from '@/lib/config';

export async function canOpenPlatformWorkspace(expected?: { organizationId: string; userId: string }): Promise<boolean> {
  const platformId = process.env.SALSYS_COMMERCIAL_PLATFORM_ORG_ID?.trim();
  if (useMockData || process.env.SALSYS_PLATFORM_ADMIN_ENABLED !== 'true' || !platformId ||
      (expected && expected.organizationId !== platformId)) return false;
  // Navigation only. The destination repeats its own server authorization.
  // Bound the optional navigation lookup so a commercial outage cannot block CRM login.
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        if (!expected) {
          const session = await createClient();
          const { data, error } = await session.rpc('get_current_workspace_context_v1');
          if (error || !data || (data.active_organization_id ?? data.organization_id) !== platformId ||
              !['owner','admin'].includes(data.role)) return false;
        }
        const operator = await readPlanReviewState();
        return Boolean(operator.actorId && (!expected || operator.actorId === expected.userId));
      })(),
      new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), 1500); }),
    ]);
  } catch { return false; }
  finally { if (timer) clearTimeout(timer); }
}
