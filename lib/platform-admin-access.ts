import 'server-only';

import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceContext } from '@/lib/workspace';

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

  return {
    user,
    activeWorkspace: active,
  };
}
