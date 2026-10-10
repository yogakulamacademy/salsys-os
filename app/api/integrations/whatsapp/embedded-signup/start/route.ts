import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  createOAuthState,
  hashOAuthState,
} from '@/lib/integrations/crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getWorkspaceContextForUser } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

const INTENT_TTL_MS = 10 * 60 * 1000;

function jsonError(message: string, status: number) {
  return NextResponse.json(
    { ok: false, error: message },
    {
      status,
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}

function sameOrigin(request: NextRequest) {
  return request.headers.get('origin') === request.nextUrl.origin;
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return jsonError('Invalid request origin.', 403);
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return jsonError('Sign in to connect WhatsApp.', 401);
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, active')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError || !profile || profile.active !== true) {
    return jsonError('Your CRM account is not active.', 403);
  }

  const workspaceContext = await getWorkspaceContextForUser(
    supabase,
    user.id,
  );
  const activeWorkspace = workspaceContext.activeWorkspace;

  if (
    !activeWorkspace ||
    !['owner', 'admin'].includes(activeWorkspace.role)
  ) {
    return jsonError(
      'You do not have permission to manage integrations for this workspace.',
      403,
    );
  }

  const admin = createAdminClient();
  const organizationId = activeWorkspace.organizationId;

  const { data: organization, error: organizationError } = await admin
    .from('organizations')
    .select('id, status')
    .eq('id', organizationId)
    .maybeSingle();

  if (
    organizationError ||
    !organization ||
    organization.status !== 'active'
  ) {
    return jsonError('This workspace is not active.', 403);
  }

  const intent = createOAuthState();
  const intentHash = hashOAuthState(intent);
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + INTENT_TTL_MS,
  ).toISOString();

  await admin
    .from('integration_oauth_states')
    .delete()
    .eq('created_by', user.id)
    .eq('provider', 'whatsapp')
    .lt('expires_at', now.toISOString());

  const { error: stateInsertError } = await admin
    .from('integration_oauth_states')
    .insert({
      provider: 'whatsapp',
      state_hash: intentHash,
      created_by: user.id,
      organization_id: organizationId,
      return_to: '/settings/integrations',
      expires_at: expiresAt,
    });

  if (stateInsertError) {
    return jsonError(
      `Unable to start WhatsApp authorization: ${stateInsertError.message}`,
      500,
    );
  }

  return NextResponse.json(
    {
      ok: true,
      intent,
      expiresAt,
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}
