import { NextRequest, NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { requireCurrentOrganizationId } from '@/lib/workspace';
import { getApprovedWhatsAppTemplates } from '@/lib/whatsapp-templates';
import { resolveVerifiedTemplateVariables } from '@/lib/integrations/whatsapp-template-variable-rules';

export const dynamic = 'force-dynamic';

function reply(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

/**
 * Preview-only: never calls the WhatsApp send endpoint, never updates CRM,
 * and never asks AI to invent placeholder values.
 *
 * Explicit feature gate allows security / tenant acceptance before rollout.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ leadId: string }> },
) {
  if (process.env.WA_TEMPLATE_VARIABLE_RESOLVER_ENABLED !== 'true') {
    return reply({ ok: false, error: 'Verified template fill is not enabled.' }, 404);
  }
  if (request.headers.get('origin') !== request.nextUrl.origin) {
    return reply({ ok: false, error: 'Invalid request origin.' }, 403);
  }
  const { leadId } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(leadId)) {
    return reply({ ok: false, error: 'Invalid lead ID.' }, 400);
  }
  if (Number(request.headers.get('content-length') || 0) > 1024) {
    return reply({ ok: false, error: 'Request is too large.' }, 413);
  }

  let requested: { templateName?: unknown; language?: unknown };
  try {
    const raw = await request.text();
    if (raw.length > 1024) return reply({ ok: false, error: 'Request is too large.' }, 413);
    requested = JSON.parse(raw);
  } catch {
    return reply({ ok: false, error: 'Invalid request payload.' }, 400);
  }
  const name = typeof requested?.templateName === 'string' ? requested.templateName : '';
  const language = typeof requested?.language === 'string' ? requested.language : '';
  if (!/^[a-z0-9_]{1,512}$/.test(name) || !/^[a-z]{2,3}(?:_[A-Z]{2})?$/.test(language)) {
    return reply({ ok: false, error: 'Invalid template identity.' }, 400);
  }

  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return reply({ ok: false, error: 'Sign in required.' }, 401);

    const { data: canWorkLead, error: accessError } = await supabase.rpc(
      'can_work_lead', { p_lead_id: leadId },
    );
    if (accessError || canWorkLead !== true) {
      return reply({ ok: false, error: 'You do not have access to this lead.' }, 403);
    }

    const organizationId = await requireCurrentOrganizationId(supabase, user.id);
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('id,first_name,display_name,lead_name,interested_course_id,preferred_month')
      .eq('id', leadId)
      .eq('organization_id', organizationId)
      .maybeSingle();
    if (leadError || !lead) {
      return reply({ ok: false, error: 'Lead context is unavailable.' }, 404);
    }

    // Re-check the actual tenant WABA approval; never trust a browser-supplied body.
    const catalog = await getApprovedWhatsAppTemplates(organizationId);
    if (catalog.error) {
      return reply({ ok: false, error: 'Approved template lookup is unavailable.' }, 503);
    }
    const template = catalog.templates.find(item => item.name === name && item.language === language);
    if (!template || !template.supported) {
      return reply({ ok: false, error: 'The selected template is not approved or supported.' }, 409);
    }

    let courseName: string | null = null;
    if (lead.interested_course_id) {
      const { data: course, error: courseError } = await supabase
        .from('courses')
        .select('id,name')
        .eq('id', lead.interested_course_id)
        .eq('organization_id', organizationId)
        .eq('active', true)
        .maybeSingle();
      if (courseError) {
        return reply({ ok: false, error: 'Verified course information is unavailable.' }, 503);
      }
      courseName = course?.name ?? null;
    }

    const result = resolveVerifiedTemplateVariables(template, {
      firstName: lead.first_name,
      displayName: lead.display_name,
      leadName: lead.lead_name,
      courseName,
      preferredMonth: lead.preferred_month,
    });
    return reply({
      ...result,
      customerMessageSent: false,
      source: 'verified_crm',
    }, result.mappingSupported ? 200 : 422);
  } catch {
    return reply({ ok: false, error: 'Verified template preview is temporarily unavailable.' }, 503);
  }
}
