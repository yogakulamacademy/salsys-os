'use server';

import { redirect } from 'next/navigation';

import { sendWhatsAppTemplateAction } from '@/app/conversations/actions';
import { createClient } from '@/lib/supabase/server';
import { getApprovedWhatsAppTemplates } from '@/lib/whatsapp-templates';

type HandoffCapability = {
  detected?: boolean;
  ready?: boolean;
  needs_country_code?: boolean;
  existing_whatsapp?: boolean;
  existing_whatsapp_lead_id?: string | null;
};

function conversationUrl(leadId: string, error: string) {
  const search = new URLSearchParams({ lead: leadId, error });
  return `/conversations?${search.toString()}`;
}

async function requireLeadAccess(leadId: string) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) redirect('/login');

  const { data: canWork, error: accessError } = await supabase.rpc('can_work_lead', {
    p_lead_id: leadId,
  });

  if (accessError || canWork !== true) {
    redirect(conversationUrl(leadId, 'You do not have access to this lead.'));
  }

  return supabase;
}

export async function getInstagramWhatsAppHandoffStateAction(leadId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false as const, error: 'Authentication required.' };
  }

  const { data: canWork, error: accessError } = await supabase.rpc('can_work_lead', {
    p_lead_id: leadId,
  });
  if (accessError || canWork !== true) {
    return { ok: false as const, error: 'Lead access denied.' };
  }

  const { data: lead, error: leadError } = await supabase
    .from('leads')
    .select('organization_id,lead_creation_channel,current_contact_channel')
    .eq('id', leadId)
    .limit(1)
    .maybeSingle();

  if (leadError || !lead?.organization_id) {
    return { ok: false as const, error: 'Unable to resolve the selected lead.' };
  }

  if (
    lead.lead_creation_channel !== 'instagram' ||
    lead.current_contact_channel !== 'instagram'
  ) {
    return {
      ok: true as const,
      detected: false,
      ready: false,
      needsCountryCode: false,
      existingWhatsApp: false,
      existingWhatsAppLeadId: null,
      templates: [],
      loadError: null,
    };
  }

  const { data: capabilityData, error: capabilityError } = await supabase.rpc(
    'get_instagram_whatsapp_handoff_capability',
    { p_lead_id: leadId },
  );

  if (capabilityError) {
    return { ok: false as const, error: capabilityError.message };
  }

  const capability = (capabilityData ?? {}) as HandoffCapability;
  if (capability.detected !== true) {
    return {
      ok: true as const,
      detected: false,
      ready: false,
      needsCountryCode: false,
      existingWhatsApp: false,
      existingWhatsAppLeadId: null,
      templates: [],
      loadError: null,
    };
  }

  if (capability.existing_whatsapp === true) {
    return {
      ok: true as const,
      detected: true,
      ready: false,
      needsCountryCode: false,
      existingWhatsApp: true,
      existingWhatsAppLeadId: capability.existing_whatsapp_lead_id ?? null,
      templates: [],
      loadError: null,
    };
  }

  if (capability.ready !== true) {
    return {
      ok: true as const,
      detected: true,
      ready: false,
      needsCountryCode: capability.needs_country_code === true,
      existingWhatsApp: false,
      existingWhatsAppLeadId: null,
      templates: [],
      loadError: null,
    };
  }

  const catalog = await getApprovedWhatsAppTemplates(lead.organization_id);
  return {
    ok: true as const,
    detected: true,
    ready: true,
    needsCountryCode: false,
    existingWhatsApp: false,
    existingWhatsAppLeadId: null,
    templates: catalog.templates,
    loadError: catalog.error,
  };
}

export async function sendInstagramWhatsAppHandoffTemplateAction(
  leadId: string,
  formData: FormData,
) {
  const supabase = await requireLeadAccess(leadId);

  const { data: lead, error: leadError } = await supabase
    .from('leads')
    .select('lead_creation_channel,current_contact_channel')
    .eq('id', leadId)
    .limit(1)
    .maybeSingle();

  if (
    leadError ||
    !lead ||
    lead.lead_creation_channel !== 'instagram' ||
    lead.current_contact_channel !== 'instagram'
  ) {
    redirect(
      conversationUrl(
        leadId,
        'This lead is no longer eligible for an Instagram to WhatsApp handoff.',
      ),
    );
  }

  const { data: capabilityData, error: capabilityError } = await supabase.rpc(
    'get_instagram_whatsapp_handoff_capability',
    { p_lead_id: leadId },
  );

  const capability = (capabilityData ?? {}) as HandoffCapability;
  if (
    capabilityError ||
    capability.existing_whatsapp === true ||
    capability.ready !== true
  ) {
    redirect(
      conversationUrl(
        leadId,
        capability.existing_whatsapp === true
          ? 'This phone number is already connected to an existing WhatsApp conversation.'
          : capability.needs_country_code === true
            ? 'Add the international country code before starting WhatsApp.'
            : 'A usable Instagram-shared phone number is required before starting WhatsApp.',
      ),
    );
  }

  return sendWhatsAppTemplateAction(leadId, formData);
}
