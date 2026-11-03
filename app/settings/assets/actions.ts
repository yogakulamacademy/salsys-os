'use server';

import { randomUUID } from 'node:crypto';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { useMockData } from '@/lib/config';
import { createClient } from '@/lib/supabase/server';
import { requireCurrentOrganizationId } from '@/lib/workspace';

const PRIVATE_ASSET_BUCKET = 'sales-assets-private';
const MAX_ASSET_BYTES = 50 * 1024 * 1024;

const mimeKinds = new Map<string, { kind: 'image' | 'video' | 'pdf' | 'audio'; extension: string }>([
  ['image/jpeg', { kind: 'image', extension: 'jpg' }],
  ['image/png', { kind: 'image', extension: 'png' }],
  ['image/webp', { kind: 'image', extension: 'webp' }],
  ['application/pdf', { kind: 'pdf', extension: 'pdf' }],
  ['video/mp4', { kind: 'video', extension: 'mp4' }],
  ['video/quicktime', { kind: 'video', extension: 'mov' }],
  ['audio/mpeg', { kind: 'audio', extension: 'mp3' }],
  ['audio/mp4', { kind: 'audio', extension: 'm4a' }],
  ['audio/wav', { kind: 'audio', extension: 'wav' }],
]);

const allowedChannels = new Set(['whatsapp', 'instagram', 'email', 'webchat', 'sms', 'other']);

function assetRedirect(type: 'notice' | 'error', message: string): never {
  redirect(`/settings/assets?${type}=${encodeURIComponent(message)}`);
}

function textValue(formData: FormData, key: string) {
  return String(formData.get(key) ?? '').trim();
}

function commaList(formData: FormData, key: string) {
  return [...new Set(
    textValue(formData, key)
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  )].slice(0, 50);
}

function multiValue(formData: FormData, key: string) {
  return [...new Set(
    formData
      .getAll(key)
      .map((value) => String(value).trim().toLowerCase())
      .filter(Boolean),
  )];
}

function optionalUtcDateTime(raw: string, label: string) {
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)) {
    assetRedirect('error', `${label} must be a valid UTC date and time.`);
  }

  const timestamp = Date.parse(`${raw}:00.000Z`);
  if (!Number.isFinite(timestamp)) {
    assetRedirect('error', `${label} must be a valid UTC date and time.`);
  }

  return new Date(timestamp).toISOString();
}

async function currentContext() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    assetRedirect('error', 'Your session has expired. Sign in again.');
  }

  const organizationId = await requireCurrentOrganizationId(supabase, user.id);
  const { data: canManage, error: manageError } = await supabase.rpc(
    'can_manage_organization',
    { p_organization_id: organizationId },
  );

  if (manageError || canManage !== true) {
    assetRedirect('error', 'Only organization admins can manage sales assets.');
  }

  return { supabase, organizationId };
}

export async function createSalesAssetAction(formData: FormData) {
  if (useMockData) {
    assetRedirect('error', 'Mock mode is active. Sales assets were not changed.');
  }

  const title = textValue(formData, 'title');
  const description = textValue(formData, 'description');
  const rightsOwner = textValue(formData, 'rights_owner');
  const rightsReference = textValue(formData, 'rights_reference');
  const altText = textValue(formData, 'accessibility_alt_text');
  const caption = textValue(formData, 'accessibility_caption');
  const courseScope = commaList(formData, 'course_scope');
  const locationScope = commaList(formData, 'location_scope');
  const languageScope = commaList(formData, 'language_scope');
  const channelScope = multiValue(formData, 'channel_scope');
  const rightsValidUntil = optionalUtcDateTime(textValue(formData, 'rights_valid_until'), 'Rights valid until');
  const validFrom = optionalUtcDateTime(textValue(formData, 'valid_from'), 'Valid from');
  const validUntil = optionalUtcDateTime(textValue(formData, 'valid_until'), 'Valid until');
  const fileValue = formData.get('asset_file');

  if (!title || title.length > 180) {
    assetRedirect('error', 'Asset title must be between 1 and 180 characters.');
  }

  if (!rightsOwner || !rightsReference) {
    assetRedirect('error', 'Rights owner and clearance reference are required.');
  }

  if (validFrom && validUntil && Date.parse(validUntil) <= Date.parse(validFrom)) {
    assetRedirect('error', 'Valid until must be later than valid from.');
  }

  if (!(fileValue instanceof File) || fileValue.size <= 0) {
    assetRedirect('error', 'Choose a sales asset file to upload.');
  }

  if (fileValue.size > MAX_ASSET_BYTES) {
    assetRedirect('error', 'Sales assets must be 50 MB or smaller.');
  }

  const mime = fileValue.type.toLowerCase();
  const media = mimeKinds.get(mime);
  if (!media) {
    assetRedirect('error', 'Unsupported asset file type. Use JPG, PNG, WebP, PDF, MP4, MOV, MP3, M4A or WAV.');
  }

  if (media.kind === 'image' && !altText) {
    assetRedirect('error', 'Image assets require accessibility alt text.');
  }

  if (channelScope.some((channel) => !allowedChannels.has(channel))) {
    assetRedirect('error', 'Select only supported delivery channels.');
  }

  const { supabase, organizationId } = await currentContext();
  const storagePath = `${organizationId}/${randomUUID()}.${media.extension}`;

  const { error: uploadError } = await supabase.storage
    .from(PRIVATE_ASSET_BUCKET)
    .upload(storagePath, fileValue, {
      contentType: mime,
      upsert: false,
      cacheControl: '3600',
    });

  if (uploadError) {
    assetRedirect('error', uploadError.message || 'Unable to upload the private sales asset.');
  }

  const { error: registerError } = await supabase.rpc('register_sales_asset_v1', {
    p_organization_id: organizationId,
    p_title: title,
    p_description: description || null,
    p_asset_kind: media.kind,
    p_storage_path: storagePath,
    p_mime_type: mime,
    p_size_bytes: fileValue.size,
    p_course_scope: courseScope,
    p_location_scope: locationScope,
    p_language_scope: languageScope,
    p_channel_scope: channelScope,
    p_rights_owner: rightsOwner,
    p_rights_reference: rightsReference,
    p_rights_valid_until: rightsValidUntil,
    p_valid_from: validFrom,
    p_valid_until: validUntil,
    p_accessibility_alt_text: altText || null,
    p_accessibility_caption: caption || null,
  });

  if (registerError) {
    await supabase.storage.from(PRIVATE_ASSET_BUCKET).remove([storagePath]);
    assetRedirect('error', registerError.message || 'Unable to register the sales asset.');
  }

  revalidatePath('/settings/assets');
  assetRedirect('notice', 'Private sales asset uploaded as a draft. Review and approve it before use.');
}

export async function approveSalesAssetAction(formData: FormData) {
  if (useMockData) {
    assetRedirect('error', 'Mock mode is active. Sales assets were not changed.');
  }

  const assetId = textValue(formData, 'asset_id');
  const autoSendAllowed = textValue(formData, 'auto_send_allowed') === 'true';
  if (!assetId) assetRedirect('error', 'Sales asset is required.');

  const { supabase, organizationId } = await currentContext();
  const { error } = await supabase.rpc('approve_sales_asset_v1', {
    p_organization_id: organizationId,
    p_asset_id: assetId,
    p_auto_send_allowed: autoSendAllowed,
  });

  if (error) {
    assetRedirect('error', error.message || 'Unable to approve the sales asset.');
  }

  revalidatePath('/settings/assets');
  assetRedirect(
    'notice',
    autoSendAllowed
      ? 'Sales asset approved with governed auto-send permission for its scoped channels.'
      : 'Sales asset approved for human-selected use. Automatic dispatch remains disabled.',
  );
}

export async function revokeSalesAssetAction(formData: FormData) {
  if (useMockData) {
    assetRedirect('error', 'Mock mode is active. Sales assets were not changed.');
  }

  const assetId = textValue(formData, 'asset_id');
  const reason = textValue(formData, 'reason');
  if (!assetId) assetRedirect('error', 'Sales asset is required.');
  if (!reason || reason.length > 500) {
    assetRedirect('error', 'Revocation reason must be between 1 and 500 characters.');
  }

  const { supabase, organizationId } = await currentContext();
  const { error } = await supabase.rpc('revoke_sales_asset_v1', {
    p_organization_id: organizationId,
    p_asset_id: assetId,
    p_reason: reason,
  });

  if (error) {
    assetRedirect('error', error.message || 'Unable to revoke the sales asset.');
  }

  revalidatePath('/settings/assets');
  assetRedirect('notice', 'Sales asset revoked. Any future dispatch revalidation will now fail closed.');
}
