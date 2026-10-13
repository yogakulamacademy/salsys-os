'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getWorkspaceContextForUser } from '@/lib/workspace';

function textValue(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? '').trim();
  return value || null;
}

function trackingUrl(key: 'notice' | 'error', value: string) {
  const params = new URLSearchParams({ [key]: value });
  return `/tracking?${params.toString()}`;
}

function normalizeHostname(value: string) {
  const raw = value.trim().toLowerCase();
  if (!raw) return null;

  try {
    const parsed = new URL(raw.includes('://') ? raw : `https://${raw}`);
    const hostname = parsed.hostname.replace(/\.$/, '').toLowerCase();
    return hostname || null;
  } catch {
    return null;
  }
}

async function requireTrackingAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) redirect('/login');

  const workspace = await getWorkspaceContextForUser(supabase, user.id);

  if (!workspace.activeOrganizationId || !workspace.activeWorkspace) {
    redirect('/workspace?next=/tracking');
  }

  if (!['owner', 'admin'].includes(workspace.activeWorkspace.role)) {
    redirect(trackingUrl('error', 'Only workspace owners and admins can manage tracking installation.'));
  }

  return {
    supabase,
    user,
    organizationId: workspace.activeOrganizationId,
  };
}

export async function registerTrackingSiteAction(formData: FormData) {
  const { organizationId } = await requireTrackingAdmin();
  const submitted = textValue(formData, 'hostname');
  const hostname = submitted ? normalizeHostname(submitted) : null;

  if (!hostname || hostname === 'localhost') {
    redirect(trackingUrl('error', 'Enter a valid public website hostname.'));
  }

  const admin = createAdminClient();
  const { data: existing, error: lookupError } = await admin
    .from('organization_sites')
    .select('id,organization_id,status')
    .eq('hostname', hostname)
    .maybeSingle();

  if (lookupError) {
    redirect(trackingUrl('error', lookupError.message));
  }

  if (existing && String(existing.organization_id) !== organizationId) {
    redirect(trackingUrl('error', 'This website is already assigned to another workspace.'));
  }

  if (existing) {
    const { error: updateError } = await admin
      .from('organization_sites')
      .update({ status: 'active' })
      .eq('id', existing.id)
      .eq('organization_id', organizationId);

    if (updateError) redirect(trackingUrl('error', updateError.message));
  } else {
    const { error: insertError } = await admin
      .from('organization_sites')
      .insert({
        organization_id: organizationId,
        hostname,
        status: 'active',
      });

    if (insertError) redirect(trackingUrl('error', insertError.message));
  }

  revalidatePath('/tracking');
  redirect(trackingUrl('notice', `${hostname} is now an active tracking domain.`));
}

export async function createTrackingCredentialAction(formData: FormData) {
  const { supabase, organizationId } = await requireTrackingAdmin();
  const submittedHost = textValue(formData, 'hostname');
  const hostname = submittedHost ? normalizeHostname(submittedHost) : null;

  if (!hostname) {
    redirect(trackingUrl('error', 'Choose an active website before creating a tracking key.'));
  }

  const admin = createAdminClient();
  const { data: site } = await admin
    .from('organization_sites')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('hostname', hostname)
    .eq('status', 'active')
    .maybeSingle();

  if (!site) {
    redirect(trackingUrl('error', 'The selected website is not active in this workspace.'));
  }

  const { data, error } = await supabase.rpc('create_integration_api_credential', {
    p_organization_id: organizationId,
    p_name: `${hostname} browser tracking`,
    p_credential_kind: 'website',
    p_environment: 'live',
    p_allowed_hosts: [hostname],
    p_scopes: ['events:write'],
    p_expires_at: null,
  });

  if (error || !data) {
    redirect(trackingUrl('error', error?.message ?? 'Unable to create tracking key.'));
  }

  revalidatePath('/tracking');
  redirect(trackingUrl('notice', `Live browser tracking key created for ${hostname}.`));
}

export async function rotateTrackingCredentialAction(formData: FormData) {
  const { supabase } = await requireTrackingAdmin();
  const credentialId = textValue(formData, 'credential_id');

  if (!credentialId) {
    redirect(trackingUrl('error', 'Tracking credential is missing.'));
  }

  const { error } = await supabase.rpc('rotate_integration_api_credential', {
    p_credential_id: credentialId,
  });

  if (error) redirect(trackingUrl('error', error.message));

  revalidatePath('/tracking');
  redirect(trackingUrl('notice', 'Tracking key rotated. Update the website snippet with the new publishable key.'));
}

export async function revokeTrackingCredentialAction(formData: FormData) {
  const { supabase } = await requireTrackingAdmin();
  const credentialId = textValue(formData, 'credential_id');

  if (!credentialId) {
    redirect(trackingUrl('error', 'Tracking credential is missing.'));
  }

  const { error } = await supabase.rpc('revoke_integration_api_credential', {
    p_credential_id: credentialId,
  });

  if (error) redirect(trackingUrl('error', error.message));

  revalidatePath('/tracking');
  redirect(trackingUrl('notice', 'Tracking key revoked. Browser events using that key will no longer be accepted.'));
}
