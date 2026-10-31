import { NextRequest, NextResponse } from 'next/server';

import { customAudienceFiltersFromSearchParams, hasCustomAudienceFilters, loadCustomAudienceBuilderOptions, previewCustomAudience } from '@/lib/ad-activation/custom-audience-rule-builder';
import { createClient } from '@/lib/supabase/server';
import { getWorkspaceContextForUser } from '@/lib/workspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_ROLES = new Set(['owner', 'admin', 'manager']);

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return json({ ok: false, error: 'Sign in to preview audiences.' }, 401);

  const workspace = await getWorkspaceContextForUser(supabase, user.id);
  const activeWorkspace = workspace.activeWorkspace;
  if (!activeWorkspace || !ALLOWED_ROLES.has(activeWorkspace.role)) {
    return json({ ok: false, error: 'This audience workspace requires Owner, Admin or Manager access.' }, 403);
  }

  try {
    const filters = customAudienceFiltersFromSearchParams(request.nextUrl.searchParams);
    const [options, preview] = await Promise.all([
      loadCustomAudienceBuilderOptions(activeWorkspace.organizationId),
      hasCustomAudienceFilters(filters)
        ? previewCustomAudience({ organizationId: activeWorkspace.organizationId, filters })
        : Promise.resolve(null),
    ]);
    return json({ ok: true, filters, options, preview }, 200);
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : 'Unable to preview audience.' }, 500);
  }
}

function json(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}
