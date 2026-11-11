import { NextRequest, NextResponse } from 'next/server';

import {
  authorizeTemplateManager, postMetaTemplate,
  TemplateAuthoringError, validateTemplateAuthoringInput,
} from '@/lib/integrations/whatsapp-template-authoring';

export const dynamic = 'force-dynamic';

const json = (data: Record<string, unknown>, status = 200) =>
  NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(request: NextRequest) {
  if (request.headers.get('origin') !== request.nextUrl.origin) {
    return json({ ok: false, error: 'Invalid request origin.' }, 403);
  }

  // Explicit independent gate. Opening WhatsApp send gates does NOT open template authoring.
  if (process.env.WA_TEMPLATE_AUTHORING_ENABLED !== 'true') {
    return json({ ok: false, error: 'Meta template submission is disabled until rollout approval.' }, 403);
  }

  let actor: Awaited<ReturnType<typeof authorizeTemplateManager>> | null = null;
  let claimedDraftId: string | null = null;
  try {
    actor = await authorizeTemplateManager();
    if (Number(request.headers.get('content-length') || 0) > 4096) {
      return json({ ok: false, error: 'Request is too large.' }, 413);
    }
    const payloadText = await request.text();
    if (payloadText.length > 4096) return json({ ok: false, error: 'Request is too large.' }, 413);
    const payload = JSON.parse(payloadText) as { draftId?: unknown };
    const draftId = typeof payload.draftId === 'string' ? payload.draftId.trim() : '';
    if (!/^[0-9a-f-]{36}$/i.test(draftId)) return json({ ok: false, error: 'Invalid draft ID.' }, 400);

    const { data: draft, error: readError } = await actor.admin.from('whatsapp_template_drafts')
      .select('id,status,payload,template_name,language_code')
      .eq('organization_id', actor.organizationId)
      .eq('whatsapp_account_id', actor.accountId)
      .eq('id', draftId)
      .maybeSingle();
    if (readError) throw readError;
    if (!draft || draft.status !== 'draft') {
      return json({ ok: false, error: 'Only local drafts can be submitted.' }, 409);
    }

    const input = validateTemplateAuthoringInput(draft.payload, true);
    if (input.name !== draft.template_name || input.language !== draft.language_code) {
      return json({ ok: false, error: 'Draft metadata is inconsistent.' }, 409);
    }

    const { data: existing, error: existingError } = await actor.admin.from('automation_whatsapp_templates')
      .select('id,approval_status')
      .eq('organization_id', actor.organizationId)
      .eq('whatsapp_account_id', actor.accountId)
      .eq('template_name', input.name)
      .eq('language_code', input.language)
      .limit(1);
    if (existingError) throw existingError;
    if (existing?.length) {
      return json({ ok: false, error: 'Meta already has this template name and language. Sync before editing.' }, 409);
    }

    // Atomic claim: protects against two admins submitting the same draft simultaneously.
    const { data: claim, error: claimError } = await actor.admin.from('whatsapp_template_drafts')
      .update({ status: 'submitting', submission_attempted_at: new Date().toISOString(), last_error: null })
      .eq('organization_id', actor.organizationId)
      .eq('whatsapp_account_id', actor.accountId)
      .eq('id', draftId)
      .eq('status', 'draft')
      .select('id').maybeSingle();
    if (claimError) throw claimError;
    if (!claim?.id) return json({ ok: false, error: 'Draft was claimed by another review request.' }, 409);
    claimedDraftId = draftId;

    const result = await postMetaTemplate(actor.wabaId, actor.accessToken, input);
    if (!result.id) {
      throw new Error('Meta did not return a template identifier. Submission outcome requires reconciliation.');
    }

    const { error: finishError } = await actor.admin.from('whatsapp_template_drafts')
      .update({
        status: 'submitted',
        provider_template_id: result.id,
        provider_status: result.status || 'PENDING',
        submitted_at: new Date().toISOString(),
        last_error: null,
      })
      .eq('organization_id', actor.organizationId)
      .eq('whatsapp_account_id', actor.accountId)
      .eq('id', draftId)
      .eq('status', 'submitting');
    if (finishError) throw finishError;

    return json({
      ok: true, draftId, providerStatus: result.status || 'PENDING',
      customerMessageSent: false,
      message: 'Template submitted to Meta. Run Sync templates to confirm provider review status.',
    });
  } catch (error) {
    const definiteProviderRejection =
      error instanceof TemplateAuthoringError && error.status === 422;

    if (claimedDraftId && actor) {
      // Never automatically repeat a potentially accepted provider submission.
      await actor.admin.from('whatsapp_template_drafts').update({
        status: definiteProviderRejection ? 'draft' : 'uncertain',
        last_error: definiteProviderRejection
          ? 'Meta declined the submission. Revise the template before retrying.'
          : 'Submission outcome uncertain. Sync from Meta and reconcile before attempting another submission.',
      })
        .eq('organization_id', actor.organizationId)
        .eq('whatsapp_account_id', actor.accountId)
        .eq('id', claimedDraftId)
        .eq('status', 'submitting');
    }

    if (error instanceof SyntaxError) return json({ ok: false, error: 'Invalid JSON payload.' }, 400);
    if (error instanceof TemplateAuthoringError) {
      return json({ ok: false, error: error.message, outcomeUncertain: Boolean(claimedDraftId && !definiteProviderRejection) }, error.status);
    }
    console.error('WHATSAPP_TEMPLATE_SUBMIT_ERROR', error instanceof Error ? error.name : 'unknown');
    return json({
      ok: false,
      error: claimedDraftId
        ? 'Submission outcome uncertain. Sync from Meta; do not retry until reconciled.'
        : 'Unable to prepare template submission.',
      outcomeUncertain: Boolean(claimedDraftId),
    }, 502);
  }
}
