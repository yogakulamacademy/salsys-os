import { NextRequest, NextResponse } from 'next/server';

import {
  authorizeTemplateManager, TemplateAuthoringError, validateTemplateAuthoringInput,
} from '@/lib/integrations/whatsapp-template-authoring';

export const dynamic = 'force-dynamic';

const json = (data: Record<string, unknown>, status = 200) =>
  NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });

function handle(error: unknown) {
  if (error instanceof TemplateAuthoringError) return json({ ok: false, error: error.message }, error.status);
  console.error('WHATSAPP_TEMPLATE_DRAFT_ERROR', error instanceof Error ? error.name : 'unknown');
  return json({ ok: false, error: 'Unable to process template draft.' }, 500);
}

export async function GET(request: NextRequest) {
  try {
    const actor = await authorizeTemplateManager();
    const id = request.nextUrl.searchParams.get('id');
    if (id && !/^[0-9a-f-]{36}$/i.test(id)) {
      return json({ ok: false, error: 'Invalid draft ID.' }, 400);
    }
    let query = actor.admin.from('whatsapp_template_drafts')
      .select('id,template_name,language_code,category,payload,status,provider_template_id,provider_status,last_error,updated_at')
      .eq('organization_id', actor.organizationId)
      .eq('whatsapp_account_id', actor.accountId)
      .order('updated_at', { ascending: false })
      .limit(100);
    if (id) query = query.eq('id', id);
    const { data, error } = await query;
    if (error) throw error;
    return json({ ok: true, drafts: data ?? [] });
  } catch (error) {
    return handle(error);
  }
}

export async function POST(request: NextRequest) {
  if (request.headers.get('origin') !== request.nextUrl.origin) {
    return json({ ok: false, error: 'Invalid request origin.' }, 403);
  }
  try {
    if (Number(request.headers.get('content-length') || 0) > 16000) {
      return json({ ok: false, error: 'Template payload is too large.' }, 413);
    }
    const actor = await authorizeTemplateManager();
    const bodyText = await request.text();
    if (bodyText.length > 16000) return json({ ok: false, error: 'Template payload is too large.' }, 413);
    const body = JSON.parse(bodyText) as { draftId?: unknown; template?: unknown };
    const input = validateTemplateAuthoringInput(body.template, false);
    const draftId = typeof body.draftId === 'string' ? body.draftId.trim() : '';

    if (draftId) {
      if (!/^[0-9a-f-]{36}$/i.test(draftId)) {
        return json({ ok: false, error: 'Invalid draft ID.' }, 400);
      }
      const { data, error } = await actor.admin.from('whatsapp_template_drafts')
        .update({
          template_name: input.name, language_code: input.language,
          category: input.category, payload: input, updated_by: actor.userId,
          last_error: null,
        })
        .eq('id', draftId)
        .eq('organization_id', actor.organizationId)
        .eq('whatsapp_account_id', actor.accountId)
        .eq('status', 'draft')
        .select('id').maybeSingle();
      if (error) throw error;
      if (!data?.id) return json({ ok: false, error: 'Draft unavailable or already submitted.' }, 409);
      return json({ ok: true, draftId: data.id, customerMessageSent: false });
    }

    // Do not override a provider-synchronized template with an unapproved local draft.
    const { data: providerMatches, error: providerError } = await actor.admin
      .from('automation_whatsapp_templates')
      .select('id')
      .eq('organization_id', actor.organizationId)
      .eq('whatsapp_account_id', actor.accountId)
      .eq('template_name', input.name)
      .eq('language_code', input.language)
      .limit(1);
    if (providerError) throw providerError;
    if (providerMatches?.length) {
      return json({ ok: false, error: 'A Meta template already uses this name and language.' }, 409);
    }

    const { data, error } = await actor.admin.from('whatsapp_template_drafts').insert({
      organization_id: actor.organizationId,
      whatsapp_account_id: actor.accountId,
      created_by: actor.userId, updated_by: actor.userId,
      template_name: input.name, language_code: input.language,
      category: input.category, payload: input, status: 'draft',
    }).select('id').single();
    if (error) {
      if (error.code === '23505') {
        return json({ ok: false, error: 'A draft with this name and language already exists.' }, 409);
      }
      throw error;
    }
    return json({ ok: true, draftId: data.id, customerMessageSent: false }, 201);
  } catch (error) {
    if (error instanceof SyntaxError) return json({ ok: false, error: 'Invalid JSON payload.' }, 400);
    return handle(error);
  }
}
