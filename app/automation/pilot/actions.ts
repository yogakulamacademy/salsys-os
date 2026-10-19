'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { useMockData } from '@/lib/config';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { requireCurrentOrganizationId } from '@/lib/workspace';

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? '').trim();
}

function go(type: 'notice' | 'error', message: string): never {
  redirect(`/automation/pilot?${type}=${encodeURIComponent(message)}`);
}

async function adminContext() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    go('error', 'Your session has expired. Sign in again.');
  }

  const organizationId = await requireCurrentOrganizationId(supabase, user.id);
  const { data: canManage, error: manageError } = await supabase.rpc('can_manage_organization', {
    p_organization_id: organizationId,
  });

  if (manageError || canManage !== true) {
    go('error', 'Only organization admins can prepare or disarm a WhatsApp pilot.');
  }

  return { admin: createAdminClient(), organizationId, userId: user.id };
}

async function currentProviderRow(
  admin: ReturnType<typeof createAdminClient>,
  organizationId: string,
) {
  const { data, error } = await admin
    .from('automation_provider_send_settings')
    .select('id,metadata')
    .eq('organization_id', organizationId)
    .eq('channel', 'whatsapp')
    .eq('provider', 'meta_cloud_api')
    .maybeSingle();

  if (error) go('error', error.message);
  return data;
}

function revalidatePilotPages() {
  revalidatePath('/automation/pilot');
  revalidatePath('/automation/readiness');
  revalidatePath('/automation/settings');
  revalidatePath('/automation/runs');
}

export async function prepareWhatsAppPilotAction(formData: FormData) {
  if (useMockData) {
    go('error', 'Mock mode is active. Pilot configuration was not changed.');
  }

  const leadId = value(formData, 'lead_id');
  if (!leadId) go('error', 'Choose a verified primary WhatsApp lead for the pilot.');

  const { admin, organizationId, userId } = await adminContext();

  const [{ data: lead, error: leadError }, { data: whatsapp, error: whatsappError }] = await Promise.all([
    admin
      .from('leads')
      .select('id,lead_code')
      .eq('organization_id', organizationId)
      .eq('id', leadId)
      .maybeSingle(),
    admin
      .from('lead_contacts')
      .select('id,normalized_value')
      .eq('organization_id', organizationId)
      .eq('lead_id', leadId)
      .eq('contact_type', 'whatsapp')
      .eq('verified', true)
      .eq('is_primary', true)
      .limit(1)
      .maybeSingle(),
  ]);

  if (leadError || !lead) {
    go('error', leadError?.message || 'Pilot lead was not found in this workspace.');
  }
  if (whatsappError || !whatsapp) {
    go(
      'error',
      whatsappError?.message || 'Pilot lead must have a verified primary WhatsApp contact before preparation.',
    );
  }

  const { data: suppressions, error: suppressionError } = await admin
    .from('automation_suppressions')
    .select('id,reason,channel,expires_at')
    .eq('organization_id', organizationId)
    .eq('lead_id', leadId)
    .eq('active', true)
    .or('channel.is.null,channel.eq.whatsapp');

  if (suppressionError) go('error', suppressionError.message);

  const now = Date.now();
  const activeSuppression = (suppressions ?? []).find((row) => {
    if (!row.expires_at) return true;
    const expiry = new Date(row.expires_at).getTime();
    return Number.isFinite(expiry) && expiry > now;
  });

  if (activeSuppression) {
    go('error', `Pilot lead is actively suppressed for messaging (${activeSuppression.reason}).`);
  }

  const existing = await currentProviderRow(admin, organizationId);
  const metadata = {
    ...((existing?.metadata && typeof existing.metadata === 'object') ? existing.metadata : {}),
    prepared_from: 'automation_pilot_ui',
    prepared_by: userId,
    prepared_at: new Date().toISOString(),
    preparation_mode: 'provider_closed',
  };

  const payload = {
    organization_id: organizationId,
    channel: 'whatsapp',
    provider: 'meta_cloud_api',
    provider_send_enabled: false,
    pilot_mode_enabled: true,
    pilot_lead_id: leadId,
    pilot_started_at: null,
    pilot_max_messages: 1,
    pilot_require_verified_primary_whatsapp: true,
    metadata,
  };

  const { error } = existing?.id
    ? await admin
        .from('automation_provider_send_settings')
        .update(payload)
        .eq('organization_id', organizationId)
        .eq('id', existing.id)
    : await admin.from('automation_provider_send_settings').insert(payload);

  if (error) go('error', error.message);

  revalidatePilotPages();
  go(
    'notice',
    `Pilot prepared for ${lead.lead_code || 'the selected lead'}. Provider execution was explicitly kept OFF; no message was sent.`,
  );
}

export async function closeWhatsAppProviderGateAction() {
  if (useMockData) {
    go('error', 'Mock mode is active. Provider state was not changed.');
  }

  const { admin, organizationId, userId } = await adminContext();
  const existing = await currentProviderRow(admin, organizationId);

  if (!existing?.id) {
    go('notice', 'No provider settings row exists, so provider execution is already closed.');
  }

  const metadata = {
    ...((existing.metadata && typeof existing.metadata === 'object') ? existing.metadata : {}),
    provider_closed_from: 'automation_pilot_ui',
    provider_closed_by: userId,
    provider_closed_at: new Date().toISOString(),
  };

  const { error } = await admin
    .from('automation_provider_send_settings')
    .update({ provider_send_enabled: false, metadata })
    .eq('organization_id', organizationId)
    .eq('id', existing.id);

  if (error) go('error', error.message);

  revalidatePilotPages();
  go('notice', 'WhatsApp provider execution is closed. No customer message was sent.');
}

export async function resetWhatsAppPilotAction() {
  if (useMockData) {
    go('error', 'Mock mode is active. Pilot state was not changed.');
  }

  const { admin, organizationId, userId } = await adminContext();
  const existing = await currentProviderRow(admin, organizationId);

  if (!existing?.id) {
    go('notice', 'No pilot configuration exists to reset. Provider execution remains closed.');
  }

  const metadata = {
    ...((existing.metadata && typeof existing.metadata === 'object') ? existing.metadata : {}),
    pilot_reset_from: 'automation_pilot_ui',
    pilot_reset_by: userId,
    pilot_reset_at: new Date().toISOString(),
  };

  const { error } = await admin
    .from('automation_provider_send_settings')
    .update({
      provider_send_enabled: false,
      pilot_mode_enabled: false,
      pilot_lead_id: null,
      pilot_started_at: null,
      pilot_max_messages: 1,
      pilot_require_verified_primary_whatsapp: true,
      metadata,
    })
    .eq('organization_id', organizationId)
    .eq('id', existing.id);

  if (error) go('error', error.message);

  revalidatePilotPages();
  go('notice', 'Pilot configuration reset and provider execution closed. No customer message was sent.');
}
