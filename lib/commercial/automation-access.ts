import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

export async function commercialAutomationAllowed(organizationId: string, channel: 'whatsapp' | 'instagram'): Promise<boolean> {
  // Compatibility before the commercial migration. Never turn off this gate
  // once any self-service tenant exists; pausing signup uses its separate flag.
  if (process.env.SALSYS_COMMERCIAL_ACCESS_ENABLED !== 'true') {
    return process.env.SALSYS_PUBLIC_SIGNUP_ENABLED !== 'true';
  }
  try {
    const { data, error } = await createAdminClient().rpc('signup_automation_allowed_v1', {
      p_organization_id: organizationId, p_channel: channel,
    });
    return !error && data === true;
  } catch {
    return false;
  }
}
