import { NextRequest, NextResponse } from 'next/server';

import { syncWhatsAppTemplatesForOrganization } from '@/lib/integrations/whatsapp-template-sync';
import { createClient } from '@/lib/supabase/server';
import { getWorkspaceContextForUser } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

function jsonResponse(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function sameOrigin(request: NextRequest) {
  return request.headers.get('origin') === request.nextUrl.origin;
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return jsonResponse({ ok: false, error: 'Invalid request origin.' }, 403);
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return jsonResponse({ ok: false, error: 'Sign in to synchronize WhatsApp templates.' }, 401);
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id,active')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError || !profile || profile.active !== true) {
    return jsonResponse({ ok: false, error: 'Your CRM account is not active.' }, 403);
  }

  const workspaceContext = await getWorkspaceContextForUser(supabase, user.id);
  const activeWorkspace = workspaceContext.activeWorkspace;

  if (!activeWorkspace || !['owner', 'admin'].includes(activeWorkspace.role)) {
    return jsonResponse(
      { ok: false, error: 'You do not have permission to synchronize WhatsApp templates for this workspace.' },
      403,
    );
  }

  const result = await syncWhatsAppTemplatesForOrganization(activeWorkspace.organizationId);

  if (!result.ok) {
    return jsonResponse(
      {
        ok: false,
        error: result.error || 'WhatsApp template synchronization failed.',
        syncRunId: result.syncRunId,
        customerMessageSent: false,
      },
      502,
    );
  }

  return jsonResponse(
    {
      ok: true,
      syncRunId: result.syncRunId,
      pagesFetched: result.pagesFetched,
      templatesSeen: result.templatesSeen,
      templatesUpserted: result.templatesUpserted,
      templatesDeactivated: result.templatesDeactivated,
      customerMessageSent: false,
    },
    200,
  );
}
