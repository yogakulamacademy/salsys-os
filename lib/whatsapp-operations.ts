import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';

export type WhatsAppAudienceFilters = {
  stages?: string[];
  intents?: string[];
  countries?: string[];
  course_ids?: string[];
  owner_user_ids?: string[];
  source_channels?: string[];
  preferred_locations?: string[];
  require_verified_primary_whatsapp?: boolean;
};

export type WhatsAppAudienceMember = {
  leadId: string;
  displayName: string;
  contactId: string | null;
  phone: string | null;
  eligible: boolean;
  exclusionReason: string | null;
  stage: string;
  intent: string;
  country: string | null;
};

export type WhatsAppQuickReply = {
  id: string;
  title: string;
  shortcut: string;
  body: string;
  category: string | null;
};

const DEFAULT_ACTIVE_STAGES = [
  'new',
  'contacted',
  'engaged',
  'qualified',
  'high_intent',
  'payment_pending',
  'nurture',
  'not_now',
];

function arrayOfStrings(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? '').trim())
    .filter(Boolean)
    .slice(0, 100);
}

export function normalizeWhatsAppAudienceFilters(value: unknown): WhatsAppAudienceFilters {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

  return {
    stages: arrayOfStrings(source.stages),
    intents: arrayOfStrings(source.intents),
    countries: arrayOfStrings(source.countries),
    course_ids: arrayOfStrings(source.course_ids),
    owner_user_ids: arrayOfStrings(source.owner_user_ids),
    source_channels: arrayOfStrings(source.source_channels),
    preferred_locations: arrayOfStrings(source.preferred_locations),
    require_verified_primary_whatsapp:
      source.require_verified_primary_whatsapp === false ? false : true,
  };
}

export async function resolveWhatsAppAudience(params: {
  organizationId: string;
  filters: WhatsAppAudienceFilters | Record<string, unknown> | null;
  limit?: number;
}): Promise<WhatsAppAudienceMember[]> {
  const admin = createAdminClient();
  const filters = normalizeWhatsAppAudienceFilters(params.filters);
  const limit = Math.max(1, Math.min(params.limit ?? 5000, 5000));

  let query = admin
    .from('leads')
    .select(
      'id,display_name,first_name,last_name,current_stage,status,intent,country,interested_course_id,owner_user_id,lead_creation_channel,preferred_location,created_at',
    )
    .eq('organization_id', params.organizationId)
    .order('created_at', { ascending: false })
    .limit(limit);

  const stages = filters.stages?.length ? filters.stages : DEFAULT_ACTIVE_STAGES;
  query = query.in('current_stage', stages);

  if (filters.intents?.length) query = query.in('intent', filters.intents);
  if (filters.countries?.length) query = query.in('country', filters.countries);
  if (filters.course_ids?.length) query = query.in('interested_course_id', filters.course_ids);
  if (filters.owner_user_ids?.length) query = query.in('owner_user_id', filters.owner_user_ids);
  if (filters.source_channels?.length) query = query.in('lead_creation_channel', filters.source_channels);
  if (filters.preferred_locations?.length) query = query.in('preferred_location', filters.preferred_locations);

  const { data: leads, error: leadError } = await query;
  if (leadError) throw new Error(`Unable to resolve WhatsApp audience leads: ${leadError.message}`);
  if (!leads?.length) return [];

  const leadIds = leads.map((lead) => String(lead.id));

  const [{ data: contacts, error: contactError }, { data: suppressions, error: suppressionError }] =
    await Promise.all([
      admin
        .from('lead_contacts')
        .select('id,lead_id,contact_type,value,normalized_value,is_primary,verified,created_at')
        .eq('organization_id', params.organizationId)
        .in('lead_id', leadIds)
        .in('contact_type', ['whatsapp', 'phone']),
      admin
        .from('automation_suppressions')
        .select('lead_id,scope,channel,reason,expires_at')
        .eq('organization_id', params.organizationId)
        .eq('active', true)
        .in('lead_id', leadIds),
    ]);

  if (contactError) throw new Error(`Unable to resolve WhatsApp audience contacts: ${contactError.message}`);
  if (suppressionError) throw new Error(`Unable to resolve WhatsApp suppressions: ${suppressionError.message}`);

  const now = Date.now();
  const contactsByLead = new Map<string, typeof contacts>();
  for (const contact of contacts ?? []) {
    const key = String(contact.lead_id);
    const existing = contactsByLead.get(key) ?? [];
    existing.push(contact);
    contactsByLead.set(key, existing);
  }

  const suppressedLeadIds = new Set<string>();
  for (const row of suppressions ?? []) {
    const expiresAt = row.expires_at ? Date.parse(String(row.expires_at)) : null;
    if (expiresAt && Number.isFinite(expiresAt) && expiresAt <= now) continue;
    const channel = String(row.channel ?? '').toLowerCase();
    const scope = String(row.scope ?? '').toLowerCase();
    if (scope === 'all' || (scope === 'messaging' && (!channel || channel === 'whatsapp'))) {
      suppressedLeadIds.add(String(row.lead_id));
    }
  }

  return leads.map((lead) => {
    const leadId = String(lead.id);
    const candidates = [...(contactsByLead.get(leadId) ?? [])].sort((left, right) => {
      const leftWhatsApp = left.contact_type === 'whatsapp' ? 1 : 0;
      const rightWhatsApp = right.contact_type === 'whatsapp' ? 1 : 0;
      if (leftWhatsApp !== rightWhatsApp) return rightWhatsApp - leftWhatsApp;
      const leftPrimary = left.is_primary ? 1 : 0;
      const rightPrimary = right.is_primary ? 1 : 0;
      if (leftPrimary !== rightPrimary) return rightPrimary - leftPrimary;
      const leftVerified = left.verified ? 1 : 0;
      const rightVerified = right.verified ? 1 : 0;
      if (leftVerified !== rightVerified) return rightVerified - leftVerified;
      return String(right.created_at ?? '').localeCompare(String(left.created_at ?? ''));
    });

    const contact = candidates[0] ?? null;
    const phone = contact
      ? String(contact.normalized_value || contact.value || '').trim() || null
      : null;

    let exclusionReason: string | null = null;
    if (suppressedLeadIds.has(leadId)) {
      exclusionReason = 'suppressed';
    } else if (!contact || !phone) {
      exclusionReason = 'missing_whatsapp_contact';
    } else if (
      filters.require_verified_primary_whatsapp !== false &&
      !(contact.contact_type === 'whatsapp' && contact.verified === true && contact.is_primary === true)
    ) {
      exclusionReason = 'verified_primary_whatsapp_required';
    }

    const name = String(
      lead.display_name ||
        [lead.first_name, lead.last_name].filter(Boolean).join(' ') ||
        'Unnamed lead',
    );

    return {
      leadId,
      displayName: name,
      contactId: contact ? String(contact.id) : null,
      phone,
      eligible: exclusionReason === null,
      exclusionReason,
      stage: String(lead.current_stage ?? ''),
      intent: String(lead.intent ?? ''),
      country: lead.country ? String(lead.country) : null,
    };
  });
}

export async function getWhatsAppQuickReplies(
  organizationId: string,
): Promise<WhatsAppQuickReply[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('whatsapp_quick_replies')
    .select('id,title,shortcut,body,category')
    .eq('organization_id', organizationId)
    .eq('active', true)
    .order('category', { ascending: true, nullsFirst: false })
    .order('title', { ascending: true });

  if (error) return [];
  return (data ?? []).map((row) => ({
    id: String(row.id),
    title: String(row.title),
    shortcut: String(row.shortcut),
    body: String(row.body),
    category: row.category ? String(row.category) : null,
  }));
}
