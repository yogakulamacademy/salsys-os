import 'server-only';
import type { createAdminClient } from '@/lib/supabase/admin';

type Admin = ReturnType<typeof createAdminClient>;

/** Call only after signature verification and the existing tenant mapping.
 * An explicit false is an intentional commercial rejection. Infrastructure
 * failures must throw, so the webhook retains its existing retry behavior.
 */
export async function commercialInboundAllowed(
  admin: Admin,
  organizationId: string,
  channel: 'whatsapp' | 'instagram',
): Promise<boolean> {
  if (!organizationId.trim()) throw new Error('Inbound tenant unavailable.');
  if (process.env.SALSYS_COMMERCIAL_ACCESS_ENABLED !== 'true') {
    if (process.env.SALSYS_PUBLIC_SIGNUP_ENABLED !== 'true') return true;
    throw new Error('Commercial inbound authorization unavailable.');
  }
  const { data, error } = await admin.rpc('signup_integration_allowed_v1', {
    p_organization_id: organizationId,
    p_code: channel,
  });
  if (error || typeof data !== 'boolean') {
    throw new Error('Commercial inbound authorization unavailable.');
  }
  return data;
}
