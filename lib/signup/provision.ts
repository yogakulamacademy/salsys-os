import 'server-only';
import { isSignupEmailAdmitted } from '@/lib/signup/admission';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

// The RPC must atomically verify a trusted registration intent, reject existing
// memberships, and create or recover exactly one workspace per signup identity.
// Do not substitute the unrestricted platform-admin provisioning RPC here.
export async function provisionVerifiedSignup() {
  if (process.env.SALSYS_PUBLIC_SIGNUP_ENABLED !== 'true') {
    return { ok: false as const };
  }
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user || user.is_anonymous || !user.email_confirmed_at || !isSignupEmailAdmitted(user.email)) {
    return { ok: false as const };
  }
  const admin = createAdminClient();
  const result = await admin.rpc('provision_verified_signup_v1', {
    p_user_id: user.id,
  });
  if (result.error || typeof result.data !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(result.data)) {
    return { ok: false as const };
  }
  return { ok: true as const, organizationId: result.data };
}
