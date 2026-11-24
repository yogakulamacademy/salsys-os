import 'server-only';
import { getSignupOrigin } from '@/lib/signup/origin';
import { useMockData } from '@/lib/config';
import { createAdminClient } from '@/lib/supabase/admin';

export async function isPublicSignupAvailable(): Promise<boolean> {
  if (!getSignupOrigin() || useMockData || process.env.SALSYS_PUBLIC_SIGNUP_ENABLED !== 'true' ||
      process.env.SALSYS_COMMERCIAL_ACCESS_ENABLED !== 'true' ||
      process.env.SALSYS_TRIAL_RECONCILIATION_ENABLED !== 'true' ||
      !process.env.SALSYS_SIGNUP_TURNSTILE_SITE_KEY?.trim() ||
      !process.env.SALSYS_SIGNUP_TURNSTILE_SECRET?.trim()) return false;
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc('signup_trial_available_v1');
    return !error && data === true;
  } catch {
    return false;
  }
}
