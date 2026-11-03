import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { getWhatsAppRuntimeForOrganization } from '@/lib/integrations/whatsapp-connection';
import {
  resolveSalesAssetForHumanDispatch,
  type HumanResolvedSalesAsset,
} from '@/lib/sales-asset-human-dispatch';

const DEFAULT_WHATSAPP_API_VERSION = 'v26.0';
const MAX_CAPTION_LENGTH = 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024;

type JsonRecord = Record<string, unknown>;

type MetaError = {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  fbtrace_id?: string;
};

type MetaMediaUploadResponse = {
  id?: string;
  error?: MetaError;
};

type MetaMessageResponse = {
  messaging_product?: string;
  contacts?: Array<{ input?: string; wa_id?: string }>;
  messages?: Array<{ id?: string; message_status?: string }>;
  error?: MetaError;
};

type ReconcileResult = {
  ok?: boolean;
  recorded?: boolean;
  message_id?: string | null;
  provider_message_id?: string | null;
  status?: string;
  idempotent?: boolean;
};

export type WhatsAppSalesAssetMediaSendResult = {
  ok: boolean;
  auditId: string | null;
  customerMessageSent: boolean;
  providerMessageId: string | null;
  canonicalMessageId: string | null;
  canonicalCreatedAt: string | null;
  error: string | null;
  asset: {
    assetId: string;
    title: string;
    assetKind: 'image' | 'pdf' | 'document';
    version: number;
    mimeType: string;
  } | null;
};

function apiVersion() {
  const value = process.env.WA_API_VERSION?.trim() || DEFAULT_WHATSAPP_API_VERSION;
  return /^v\d+\.\d+$/.test(value) ? value : DEFAULT_WHATSAPP_API_VERSION;
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function sanitizeProviderError(error: MetaError | undefined, fallback: string) {
  const message = optionalString(error?.message) || fallback;
  const code = typeof error?.code === 'number' ? error.code : null;
  const subcode = typeof error?.error_subcode === 'number' ? error.error_subcode : null;
  return code === null
    ? message
    : `${message} · Code ${code}${subcode === null ? '' : ` · Subcode ${subcode}`}`;
}

function normalizeRecipient(value: string) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) {
    throw new Error('The lead does not have a valid WhatsApp recipient number.');
  }
  return digits;
}

function normalizeCaption(value: string) {
  const caption = value.trim();
  if (!caption) {
    throw new Error('A caption is required for this controlled media send.');
  }
  if (caption.length > MAX_CAPTION_LENGTH) {
    throw new Error(`WhatsApp media captions are limited to ${MAX_CAPTION_LENGTH} characters.`);
  }
  return caption;
}

function extensionForMime(mimeType: string) {
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'application/pdf') return 'pdf';
  return 'bin';
}

function safeFilename(asset: HumanResolvedSalesAsset) {
  const base = asset.title
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._ -]+/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 100) || 'sales-asset';
  return `${base}.${extensionForMime(asset.mimeType)}`;
}

function validateProviderAsset(asset: HumanResolvedSalesAsset) {
  if (asset.assetKind === 'image') {
    if (!['image/jpeg', 'image/png'].includes(asset.mimeType)) {
      throw new Error('WhatsApp image delivery currently supports approved JPEG or PNG Sales Assets only.');
    }
    if (asset.sizeBytes > MAX_IMAGE_BYTES) {
      throw new Error('WhatsApp image delivery is limited to 5 MB.');
    }
    return 'image' as const;
  }

  if (asset.assetKind === 'pdf' || asset.assetKind === 'document') {
    if (asset.mimeType !== 'application/pdf') {
      throw new Error('Controlled WhatsApp document delivery currently supports PDF Sales Assets only.');
    }
    if (asset.sizeBytes > MAX_DOCUMENT_BYTES) {
      throw new Error('This PDF exceeds the current 50 MB Sales Asset delivery limit.');
    }
    return 'document' as const;
  }

  throw new Error('Controlled WhatsApp media delivery currently supports approved images and PDF documents only.');
}

async function parseJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return {} as T;
  }
}

async function bestEffortDeleteMetaMedia(accessToken: string, mediaId: string) {
  try {
    await fetch(
      `https://graph.facebook.com/${apiVersion()}/${encodeURIComponent(mediaId)}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
      },
    );
  } catch {
    // The send result remains authoritative. Media cleanup is best-effort only.
  }
}

async function updateAudit(
  auditId: string,
  organizationId: string,
  patch: Record<string, unknown>,
) {
  const admin = createAdminClient();
  const { error } = await admin
    .from('sales_asset_dispatch_audits')
    .update(patch)
    .eq('id', auditId)
    .eq('organization_id', organizationId);

  if (error) {
    throw new Error(`Unable to update Sales Asset dispatch audit: ${error.message}`);
  }
}

async function markFailed(params: {
  auditId: string;
  organizationId: string;
  error: string;
  providerMediaId?: string | null;
}) {
  await updateAudit(params.auditId, params.organizationId, {
    state: 'failed',
    error: params.error.slice(0, 4000),
    ...(params.providerMediaId ? { provider_media_id: params.providerMediaId } : {}),
  });
}

async function preserveProviderAcceptance(params: {
  auditId: string;
  organizationId: string;
  providerMediaId: string;
  providerMessageId: string;
  error: string;
}) {
  await updateAudit(params.auditId, params.organizationId, {
    state: 'sent_unreconciled',
    provider_media_id: params.providerMediaId,
    provider_message_id: params.providerMessageId,
    provider_accepted_at: new Date().toISOString(),
    error: params.error.slice(0, 4000),
  });
}

export async function executeHumanWhatsAppSalesAssetSend(params: {
  organizationId: string;
  leadId: string;
  conversationId: string;
  actorId: string;
  recipient: string;
  assetId: string;
  caption: string;
  course?: string | null;
  location?: string | null;
  language?: string | null;
}): Promise<WhatsAppSalesAssetMediaSendResult> {
  const organizationId = params.organizationId.trim();
  const leadId = params.leadId.trim();
  const conversationId = params.conversationId.trim();
  const actorId = params.actorId.trim();
  const assetId = params.assetId.trim();
  const recipient = normalizeRecipient(params.recipient);
  const caption = normalizeCaption(params.caption);

  if (!organizationId || !leadId || !conversationId || !actorId || !assetId) {
    throw new Error('Organization, lead, conversation, actor and asset are required.');
  }

  const admin = createAdminClient();

  const [{ data: lead, error: leadError }, { data: conversation, error: conversationError }] =
    await Promise.all([
      admin
        .from('leads')
        .select('id,organization_id')
        .eq('id', leadId)
        .eq('organization_id', organizationId)
        .maybeSingle(),
      admin
        .from('conversations')
        .select('id,organization_id,lead_id,channel')
        .eq('id', conversationId)
        .eq('organization_id', organizationId)
        .eq('lead_id', leadId)
        .eq('channel', 'whatsapp')
        .maybeSingle(),
    ]);

  if (leadError || !lead) {
    throw new Error(leadError?.message || 'Lead no longer exists in this workspace.');
  }
  if (conversationError || !conversation) {
    throw new Error(conversationError?.message || 'WhatsApp conversation no longer matches this lead.');
  }

  const asset = await resolveSalesAssetForHumanDispatch(admin, {
    organizationId,
    assetId,
    channel: 'whatsapp',
    language: params.language ?? null,
    course: params.course ?? null,
    location: params.location ?? null,
  });

  const providerType = validateProviderAsset(asset);

  const { data: audit, error: auditError } = await admin
    .from('sales_asset_dispatch_audits')
    .insert({
      organization_id: organizationId,
      asset_id: asset.assetId,
      lead_id: leadId,
      conversation_id: conversationId,
      actor_id: actorId,
      caption,
      asset_version: asset.version,
      asset_kind: asset.assetKind,
      mime_type: asset.mimeType,
      size_bytes: asset.sizeBytes,
      state: 'prepared',
    })
    .select('id')
    .single();

  if (auditError || !audit?.id) {
    throw new Error(auditError?.message || 'Unable to create Sales Asset dispatch audit.');
  }

  const auditId = String(audit.id);
  let providerMediaId: string | null = null;
  let providerAccepted = false;
  let providerMessageId: string | null = null;

  try {
    await updateAudit(auditId, organizationId, { state: 'uploading' });

    const { data: file, error: downloadError } = await admin.storage
      .from(asset.safeReference.bucket)
      .download(asset.safeReference.path);

    if (downloadError || !file) {
      throw new Error(downloadError?.message || 'Unable to load the private Sales Asset file.');
    }

    if (file.size !== asset.sizeBytes) {
      throw new Error('The private Sales Asset file size no longer matches its governed registry record.');
    }

    const runtime = await getWhatsAppRuntimeForOrganization(organizationId);
    const uploadForm = new FormData();
    uploadForm.set('messaging_product', 'whatsapp');
    uploadForm.set('type', asset.mimeType);
    uploadForm.set('file', file, safeFilename(asset));

    const uploadResponse = await fetch(
      `https://graph.facebook.com/${apiVersion()}/${encodeURIComponent(runtime.phoneNumberId)}/media`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${runtime.accessToken}` },
        body: uploadForm,
        cache: 'no-store',
      },
    );

    const uploadPayload = await parseJson<MetaMediaUploadResponse>(uploadResponse);
    providerMediaId = optionalString(uploadPayload.id);

    if (!uploadResponse.ok || !providerMediaId) {
      throw new Error(
        sanitizeProviderError(
          uploadPayload.error,
          `Meta WhatsApp media upload returned HTTP ${uploadResponse.status}.`,
        ),
      );
    }

    await updateAudit(auditId, organizationId, {
      state: 'sending',
      provider_media_id: providerMediaId,
    });

    const mediaObject: JsonRecord = {
      id: providerMediaId,
      caption,
    };
    if (providerType === 'document') {
      mediaObject.filename = safeFilename(asset);
    }

    const sendResponse = await fetch(
      `https://graph.facebook.com/${apiVersion()}/${encodeURIComponent(runtime.phoneNumberId)}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${runtime.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: recipient,
          type: providerType,
          [providerType]: mediaObject,
        }),
        cache: 'no-store',
      },
    );

    const sendPayload = await parseJson<MetaMessageResponse>(sendResponse);
    providerMessageId = optionalString(sendPayload.messages?.[0]?.id);

    if (!sendResponse.ok || !providerMessageId) {
      const providerError = sanitizeProviderError(
        sendPayload.error,
        `Meta WhatsApp media send returned HTTP ${sendResponse.status}.`,
      );
      await bestEffortDeleteMetaMedia(runtime.accessToken, providerMediaId);
      await markFailed({
        auditId,
        organizationId,
        error: providerError,
        providerMediaId,
      });
      return {
        ok: false,
        auditId,
        customerMessageSent: false,
        providerMessageId: null,
        canonicalMessageId: null,
        canonicalCreatedAt: null,
        error: providerError,
        asset: {
          assetId: asset.assetId,
          title: asset.title,
          assetKind: asset.assetKind as 'image' | 'pdf' | 'document',
          version: asset.version,
          mimeType: asset.mimeType,
        },
      };
    }

    providerAccepted = true;

    const { data: reconcileData, error: reconcileError } = await admin.rpc(
      'record_whatsapp_sales_asset_send_success_v1',
      {
        p_organization_id: organizationId,
        p_audit_id: auditId,
        p_provider_message_id: providerMessageId,
      },
    );

    if (reconcileError) {
      throw new Error(`Meta accepted the media message, but CRM reconciliation failed: ${reconcileError.message}`);
    }

    const reconcile = asRecord(reconcileData) as ReconcileResult;
    const canonicalMessageId = optionalString(reconcile.message_id);
    if (reconcile.ok !== true || reconcile.recorded !== true || !canonicalMessageId) {
      throw new Error('Meta accepted the media message, but the canonical CRM message was not recorded.');
    }

    const { data: canonical } = await admin
      .from('messages')
      .select('created_at')
      .eq('id', canonicalMessageId)
      .eq('organization_id', organizationId)
      .maybeSingle();

    return {
      ok: true,
      auditId,
      customerMessageSent: true,
      providerMessageId,
      canonicalMessageId,
      canonicalCreatedAt: optionalString(canonical?.created_at) || new Date().toISOString(),
      error: null,
      asset: {
        assetId: asset.assetId,
        title: asset.title,
        assetKind: asset.assetKind as 'image' | 'pdf' | 'document',
        version: asset.version,
        mimeType: asset.mimeType,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'WhatsApp Sales Asset send failed.';

    if (providerAccepted && providerMediaId && providerMessageId) {
      try {
        await preserveProviderAcceptance({
          auditId,
          organizationId,
          providerMediaId,
          providerMessageId,
          error: message,
        });
      } catch (auditFailure) {
        const auditMessage =
          auditFailure instanceof Error ? auditFailure.message : 'Audit preservation failed.';
        return {
          ok: false,
          auditId,
          customerMessageSent: true,
          providerMessageId,
          canonicalMessageId: null,
          canonicalCreatedAt: new Date().toISOString(),
          error: `${message} ${auditMessage} Do not resend this attachment.`,
          asset: {
            assetId: asset.assetId,
            title: asset.title,
            assetKind: asset.assetKind as 'image' | 'pdf' | 'document',
            version: asset.version,
            mimeType: asset.mimeType,
          },
        };
      }

      return {
        ok: false,
        auditId,
        customerMessageSent: true,
        providerMessageId,
        canonicalMessageId: null,
        canonicalCreatedAt: new Date().toISOString(),
        error: `${message} Do not resend this attachment until the CRM audit is reconciled.`,
        asset: {
          assetId: asset.assetId,
          title: asset.title,
          assetKind: asset.assetKind as 'image' | 'pdf' | 'document',
          version: asset.version,
          mimeType: asset.mimeType,
        },
      };
    }

    try {
      await markFailed({
        auditId,
        organizationId,
        error: message,
        providerMediaId,
      });
    } catch {
      // Preserve the original transport error if audit finalization also fails.
    }

    return {
      ok: false,
      auditId,
      customerMessageSent: false,
      providerMessageId: null,
      canonicalMessageId: null,
      canonicalCreatedAt: null,
      error: message,
      asset: {
        assetId: asset.assetId,
        title: asset.title,
        assetKind: asset.assetKind as 'image' | 'pdf' | 'document',
        version: asset.version,
        mimeType: asset.mimeType,
      },
    };
  }
}
