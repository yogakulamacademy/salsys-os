import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

export type AdvancedOperation = 'ai_drafting' | 'ai_autopilot' | 'ad_audience_add';

export async function commercialAdvancedAllowed(organizationId: string, operation: AdvancedOperation): Promise<boolean> {
  if (!organizationId.trim()) return false;
  // Compatibility before migration only. After first self-service account,
  // never disable commercial access; pause new registrations separately.
  if (process.env.SALSYS_COMMERCIAL_ACCESS_ENABLED !== 'true') {
    return process.env.SALSYS_PUBLIC_SIGNUP_ENABLED !== 'true';
  }
  try {
    const { data, error } = await createAdminClient().rpc('signup_advanced_operation_allowed_v1', {
      p_organization_id: organizationId, p_operation: operation,
    });
    return !error && data === true;
  } catch {
    return false;
  }
}
