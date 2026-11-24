import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceContext } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

export default async function SignupOnboardingPage() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user || !user.email_confirmed_at || user.is_anonymous) {
    redirect('/login');
  }
  const workspace = await getCurrentWorkspaceContext(supabase);
  if (!workspace.activeOrganizationId ||
      !['owner', 'admin'].includes(workspace.activeWorkspace?.role ?? '')) {
    redirect('/dashboard');
  }
  const { data, error: onboardingError } = await supabase
    .from('organization_onboarding')
    .select('status')
    .eq('organization_id', workspace.activeOrganizationId)
    .maybeSingle();
  if (onboardingError) throw new Error('Unable to load workspace setup.');
  if (!data || data.status === 'completed' || data.status === 'dismissed') {
    redirect('/dashboard');
  }
  redirect('/onboarding');
}
