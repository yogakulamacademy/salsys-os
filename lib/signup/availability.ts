import 'server-only';
import { useMockData } from '@/lib/config';
import { createAdminClient } from '@/lib/supabase/admin';

export async function isPublicSignupAvailable(): Promise<boolean> {
  if (useMockData || process.env.SALSYS_PUBLIC_SIGNUP_ENABLED !== 'true' ||
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
