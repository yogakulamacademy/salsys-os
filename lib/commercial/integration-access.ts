import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

export type CommercialIntegration = 'whatsapp' | 'instagram' | 'ga4' | 'gsc' | 'google_ads' | 'meta_ads';

export async function requireCommercialIntegration(organizationId: string, code: CommercialIntegration): Promise<void> {
  // Pre-migration compatibility only. Once a self-signup tenant exists,
  // keep commercial access enabled and pause registration separately.
  if (process.env.SALSYS_COMMERCIAL_ACCESS_ENABLED !== 'true') {
    if (process.env.SALSYS_PUBLIC_SIGNUP_ENABLED !== 'true') return;
    throw new Error('Commercial integration authorization unavailable.');
  }
  const { data, error } = await createAdminClient().rpc('signup_integration_allowed_v1', {
    p_organization_id: organizationId, p_code: code,
  });
  if (error || data !== true) throw new Error('This integration is not available for the current subscription.');
}

export type CommercialConnectionProvider = 'google' | 'meta' | 'instagram' | 'whatsapp';

// Google currently requests the combined Analytics, Search Console and
// Google Ads scopes. Until OAuth scopes are split by product, require all
// three approved capabilities, rather than granting an over-broad token.
export async function requireCommercialConnection(organizationId: string, provider: CommercialConnectionProvider): Promise<void> {
  const required: CommercialIntegration[] = provider === 'google'
    ? ['ga4', 'gsc', 'google_ads']
    : provider === 'meta' ? ['meta_ads'] : [provider];
  for (const code of required) await requireCommercialIntegration(organizationId, code);
}
