'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

type SupportedChannel = 'instagram' | 'whatsapp';

export type CopilotAssetSuggestion = {
  assetId: string;
  title: string;
  description: string | null;
  assetKind: string;
  version: number;
  courseScope: string[];
  locationScope: string[];
  languageScope: string[];
  channelScope: string[];
  autoSendAllowed: boolean;
  validUntil: string | null;
  rightsValidUntil: string | null;
  accessibilityAltText: string | null;
  accessibilityCaption: string | null;
  relevance: number;
};

export type CopilotAssetDiscoveryResult =
  | {
      ok: true;
      channel: SupportedChannel;
      suggestions: CopilotAssetSuggestion[];
    }
  | {
      ok: false;
      error: string;
    };

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function nullableString(value: unknown, max = 500) {
  const text = stringValue(value);
  return text ? text.slice(0, max) : null;
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 24);
}

function numberValue(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sanitizeSuggestions(rows: unknown): CopilotAssetSuggestion[] {
  if (!Array.isArray(rows)) return [];

  return rows
    .map((row) => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
      const record = row as Record<string, unknown>;
      const assetId = stringValue(record.asset_id);
      const title = stringValue(record.title);
      const assetKind = stringValue(record.asset_kind);

      if (!assetId || !title || !assetKind) return null;

      return {
        assetId,
        title: title.slice(0, 180),
        description: nullableString(record.description, 500),
        assetKind: assetKind.slice(0, 40),
        version: Math.max(1, Math.trunc(numberValue(record.version) || 1)),
        courseScope: stringArray(record.course_scope),
        locationScope: stringArray(record.location_scope),
        languageScope: stringArray(record.language_scope),
        channelScope: stringArray(record.channel_scope),
        autoSendAllowed: record.auto_send_allowed === true,
        validUntil: nullableString(record.valid_until, 80),
        rightsValidUntil: nullableString(record.rights_valid_until, 80),
        accessibilityAltText: nullableString(record.accessibility_alt_text, 500),
        accessibilityCaption: nullableString(record.accessibility_caption, 500),
        relevance: numberValue(record.relevance),
      } satisfies CopilotAssetSuggestion;
    })
    .filter((item): item is CopilotAssetSuggestion => item !== null)
    .slice(0, 5);
}

export async function discoverCopilotSalesAssetsAction(
  leadId: string,
): Promise<CopilotAssetDiscoveryResult> {
  const normalizedLeadId = leadId.trim();
  if (!normalizedLeadId) {
    return { ok: false, error: 'Lead ID is required.' };
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
    return { ok: false, error: leadError?.message || 'Unable to load this lead.' };
  }

  const organizationId = String(lead.organization_id);
  const channel = stringValue(lead.current_contact_channel) as SupportedChannel;
  if (channel !== 'instagram' && channel !== 'whatsapp') {
    return {
      ok: false,
      error: 'Sales asset suggestions are currently available for Instagram and WhatsApp conversations.',
    };
  }

  const { data: conversation, error: conversationError } = await admin
    .from('conversations')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('lead_id', normalizedLeadId)
    .eq('channel', channel)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (conversationError || !conversation?.id) {
    return {
      ok: false,
      error: conversationError?.message || `No ${channel} conversation was found for this lead.`,
    };
  }

  const { data: latestInbound, error: messageError } = await admin
    .from('messages')
    .select('body')
    .eq('organization_id', organizationId)
    .eq('conversation_id', conversation.id)
    .eq('direction', 'inbound')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (messageError) {
    return { ok: false, error: `Unable to load the latest customer message: ${messageError.message}` };
  }

  const query = stringValue(latestInbound?.body);
  if (!query) {
    return { ok: true, channel, suggestions: [] };
  }

  let courseScope: string | null = null;
  if (lead.interested_course_id) {
    const { data: course, error: courseError } = await admin
      .from('courses')
      .select('code,name')
      .eq('organization_id', organizationId)
      .eq('id', lead.interested_course_id)
      .maybeSingle();

    if (courseError) {
      console.warn('Co-Pilot sales asset course scope lookup failed', {
        leadId: normalizedLeadId,
        organizationId,
        message: courseError.message,
      });
    } else {
      courseScope = stringValue(course?.code) || stringValue(course?.name) || null;
    }
  }

  const { data: assetRows, error: assetError } = await supabase.rpc(
    'search_sales_assets_for_copilot_v1',
    {
      p_organization_id: organizationId,
      p_query: query,
      p_channel: channel,
      p_course: courseScope,
      p_location: stringValue(lead.preferred_location) || null,
      p_language: stringValue(lead.language) || null,
      p_limit: 5,
    },
  );

  if (assetError) {
    console.warn('Co-Pilot sales asset discovery failed', {
      leadId: normalizedLeadId,
      organizationId,
      channel,
      message: assetError.message,
    });
    return {
      ok: false,
      error: 'Approved sales assets are temporarily unavailable.',
    };
  }

  return {
    ok: true,
    channel,
    suggestions: sanitizeSuggestions(assetRows),
  };
}
