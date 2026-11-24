import 'server-only';

import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceContext } from '@/lib/workspace';
import { readPlanReviewState } from '@/lib/commercial/plan-admin';

export async function requirePlatformAdminAccess() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect('/login');
  }

  const workspace = await getCurrentWorkspaceContext(supabase);
  const active = workspace.activeWorkspace;

  if (
    !active ||
    active.organizationSlug !== 'salsysos' ||
    !['owner', 'admin'].includes(active.role)
  ) {
    redirect('/dashboard');
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id,active')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError || !profile || profile.active !== true) {
    redirect('/dashboard');
  }

  // The dedicated platform workspace additionally requires the existing
  // commercial operator authority, bound to the same verified actor and tenant.
  // Preserve the legacy provisioning access contract while the new mode is off.
  if (process.env.SALSYS_PLATFORM_ADMIN_ENABLED === 'true') {
    const operator = await readPlanReviewState().catch(() => null);
    if (!operator || operator.actorId !== user.id ||
        active.organizationId !== process.env.SALSYS_COMMERCIAL_PLATFORM_ORG_ID?.trim()) {
      redirect('/dashboard');
    }
  }

  return {
    user,
    activeWorkspace: active,
  };
}
