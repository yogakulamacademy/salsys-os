'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { resolveSalesAssetForHumanDispatch } from '@/lib/sales-asset-human-dispatch';

export type PreparedCopilotAssetSelection = {
  assetId: string;
  title: string;
  assetKind: string;
  version: number;
  mimeType: string;
  sizeBytes: number;
  autoSendAllowed: boolean;
  channel: 'whatsapp';
  accessibilityAltText: string | null;
  accessibilityCaption: string | null;
};

export type PrepareCopilotAssetSelectionResult =
  | { ok: true; selection: PreparedCopilotAssetSelection }
  | { ok: false; error: string };

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export async function prepareCopilotAssetSelectionAction(
  leadId: string,
  assetId: string,
): Promise<PrepareCopilotAssetSelectionResult> {
  const normalizedLeadId = leadId.trim();
  const normalizedAssetId = assetId.trim();

  if (!normalizedLeadId || !normalizedAssetId) {
    return { ok: false, error: 'Lead and asset are required.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, error: 'Your session has expired. Sign in again.' };
  }

  const { data: canWorkLead, error: accessError } = await supabase.rpc(
    'can_work_lead',
    { p_lead_id: normalizedLeadId },
  );

  if (accessError || canWorkLead !== true) {
    return {
      ok: false,
      error: accessError?.message || 'You do not have access to this lead.',
    };
  }

  const admin = createAdminClient();
  const { data: lead, error: leadError } = await admin
    .from('leads')
    .select(
      'id,organization_id,interested_course_id,preferred_location,language,current_contact_channel',
    )
    .eq('id', normalizedLeadId)
    .maybeSingle();

  if (leadError || !lead?.organization_id) {
    return {
      ok: false,
      error: leadError?.message || 'Unable to load this lead.',
    };
  }

  const channel = stringValue(lead.current_contact_channel);
  if (channel !== 'whatsapp') {
    return {
      ok: false,
      error:
        'Controlled Sales Asset attachment is currently enabled only for WhatsApp free-form replies.',
    };
  }

  const organizationId = String(lead.organization_id);
  let courseScope: string | null = null;

  if (lead.interested_course_id) {
    const { data: course, error: courseError } = await admin
      .from('courses')
      .select('code,name')
      .eq('organization_id', organizationId)
      .eq('id', lead.interested_course_id)
      .maybeSingle();

    if (courseError) {
      return {
        ok: false,
        error: 'Current course scope is unavailable. Retry before selecting this asset.',
      };
    }

    courseScope = stringValue(course?.code) || stringValue(course?.name) || null;
  }

  try {
    const resolved = await resolveSalesAssetForHumanDispatch(admin, {
      organizationId,
      assetId: normalizedAssetId,
      channel: 'whatsapp',
      language: stringValue(lead.language) || null,
      course: courseScope,
      location: stringValue(lead.preferred_location) || null,
    });

    return {
      ok: true,
      selection: {
        assetId: resolved.assetId,
        title: resolved.title,
        assetKind: resolved.assetKind,
        version: resolved.version,
        mimeType: resolved.mimeType,
        sizeBytes: resolved.sizeBytes,
        autoSendAllowed: resolved.autoSendAllowed,
        channel: 'whatsapp',
        accessibilityAltText: resolved.accessibilityAltText,
        accessibilityCaption: resolved.accessibilityCaption,
      },
    };
  } catch (error) {
    console.warn('Human Sales Asset preflight failed', {
      leadId: normalizedLeadId,
      organizationId,
      assetId: normalizedAssetId,
      message: error instanceof Error ? error.message : String(error),
    });

    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : 'This Sales Asset is no longer eligible for human attachment.',
    };
  }
}
