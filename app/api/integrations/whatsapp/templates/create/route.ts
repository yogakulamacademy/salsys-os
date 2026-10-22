import { NextRequest, NextResponse } from 'next/server';

import {
  createWhatsAppTemplateForOrganization,
  type CreateWhatsAppTemplateInput,
} from '@/lib/integrations/whatsapp-template-create';
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
    return jsonResponse({ ok: false, error: 'Sign in to create WhatsApp templates.' }, 401);
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
      { ok: false, error: 'You do not have permission to create WhatsApp templates for this workspace.' },
      403,
    );
  }

  let body: Partial<CreateWhatsAppTemplateInput> = {};
  try {
    body = (await request.json()) as Partial<CreateWhatsAppTemplateInput>;
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid request body.' }, 400);
  }

  const category = String(body.category ?? '').toUpperCase();
  if (!['UTILITY', 'MARKETING', 'AUTHENTICATION'].includes(category)) {
    return jsonResponse({ ok: false, error: 'Choose a valid template category.' }, 400);
  }

  const result = await createWhatsAppTemplateForOrganization(activeWorkspace.organizationId, {
    name: String(body.name ?? ''),
    language: String(body.language ?? 'en_US'),
    category: category as CreateWhatsAppTemplateInput['category'],
    headerText: String(body.headerText ?? ''),
    bodyText: String(body.bodyText ?? ''),
    footerText: String(body.footerText ?? ''),
  });

  if (!result.ok) {
    return jsonResponse(
      {
        ok: false,
        error: result.error || 'WhatsApp template creation failed.',
      },
      502,
    );
  }

  return jsonResponse(
    {
      ok: true,
      templateId: result.templateId,
      status: result.status,
      category: result.category,
      syncOk: result.syncOk,
      message: result.syncOk
        ? 'Template submitted to Meta and synchronized into SalsysOS.'
        : 'Template submitted to Meta. Refresh or sync templates to update its local status.',
    },
    201,
  );
}
