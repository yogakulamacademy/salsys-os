import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { encryptIntegrationSecret } from '@/lib/integrations/crypto';

const DEFAULT_WHATSAPP_API_VERSION = 'v26.0';

type MetaPhoneNumber = {
  id?: string;
  display_phone_number?: string;
  verified_name?: string;
  quality_rating?: string;
  name_status?: string;
};

type MetaGraphPayload = {
  data?: MetaPhoneNumber[];
  success?: boolean;
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
  };
};

type ExistingPhoneRow = {
  id: string;
  organization_id: string;
};

type ExistingConnectionRow = {
  id: string;
  status: string;
  external_account_id: string | null;
};

export type ConnectWhatsAppInput = {
  organizationId: string;
  actorUserId: string;
  wabaId: string;
  phoneNumberId: string;
  accessToken: string;
  authMode?: 'manual_token' | 'embedded_signup';
  credentialSource?: string;
  scopes?: string[];
  tokenExpiresAt?: string | null;
  tokenType?: string | null;
  providerMetadata?: Record<string, unknown>;
};

export type ConnectWhatsAppResult = {
  connectionId: string;
  phoneNumberId: string;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
};

function whatsappApiVersion() {
  const value =
    process.env.WA_API_VERSION?.trim() ||
    DEFAULT_WHATSAPP_API_VERSION;

  return /^v\d+\.\d+$/.test(value)
    ? value
    : DEFAULT_WHATSAPP_API_VERSION;
}

async function readMetaPayload(response: Response): Promise<MetaGraphPayload> {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as MetaGraphPayload;
  } catch {
    return {};
  }
}

function metaError(
  payload: MetaGraphPayload,
  response: Response,
  fallback: string,
) {
  return (
    payload.error?.message?.trim() ||
    `${fallback} (HTTP ${response.status}).`
  );
}

function requiredNumericId(value: string, label: string) {
  const normalized = value.trim();

  if (!normalized || !/^\d+$/.test(normalized)) {
    throw new Error(`${label} must be a numeric Meta ID.`);
  }

  return normalized;
}

async function verifyMetaWhatsAppAccess({
  wabaId,
  phoneNumberId,
  accessToken,
}: {
  wabaId: string;
  phoneNumberId: string;
  accessToken: string;
}) {
  const version = whatsappApiVersion();

  let phoneResponse: Response;

  try {
    phoneResponse = await fetch(
      `https://graph.facebook.com/${version}/${encodeURIComponent(
        wabaId,
      )}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,name_status&limit=100`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: 'no-store',
      },
    );
  } catch {
    throw new Error('Unable to reach Meta while verifying the WhatsApp account.');
  }

  const phonePayload = await readMetaPayload(phoneResponse);

  if (!phoneResponse.ok) {
    throw new Error(
      `Meta could not verify this WhatsApp account: ${metaError(
        phonePayload,
        phoneResponse,
        'verification failed',
      )}`,
    );
  }

  const verifiedPhone = (phonePayload.data ?? []).find(
    (phone) => String(phone.id ?? '') === phoneNumberId,
  );

  if (!verifiedPhone) {
    throw new Error(
      'The Phone Number ID does not belong to the WhatsApp Business Account accessible with this token.',
    );
  }

  let subscriptionResponse: Response;

  try {
    subscriptionResponse = await fetch(
      `https://graph.facebook.com/${version}/${encodeURIComponent(
        wabaId,
      )}/subscribed_apps`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: 'no-store',
      },
    );
  } catch {
    throw new Error(
      'The WhatsApp account was verified, but SalsysOS could not subscribe the Meta app to webhook events.',
    );
  }

  const subscriptionPayload = await readMetaPayload(subscriptionResponse);

  if (!subscriptionResponse.ok) {
    throw new Error(
      `The WhatsApp account was verified, but webhook subscription failed: ${metaError(
        subscriptionPayload,
        subscriptionResponse,
        'subscription failed',
      )}`,
    );
  }

  return verifiedPhone;
}

export async function connectWhatsAppForOrganization(
  input: ConnectWhatsAppInput,
): Promise<ConnectWhatsAppResult> {
  const organizationId = input.organizationId.trim();
  const actorUserId = input.actorUserId.trim();
  const wabaId = requiredNumericId(
    input.wabaId,
    'WhatsApp Business Account ID',
  );
  const phoneNumberId = requiredNumericId(
    input.phoneNumberId,
    'Phone Number ID',
  );
  const accessToken = input.accessToken.trim();
  const authMode = input.authMode ?? 'manual_token';
  const credentialSource =
    input.credentialSource?.trim() ||
    (authMode === 'embedded_signup'
      ? 'meta_embedded_signup'
      : 'tenant_manual_setup');

  if (!organizationId || !actorUserId) {
    throw new Error('Workspace authorization is incomplete.');
  }

  if (!accessToken) {
    throw new Error('WhatsApp access token is required.');
  }

  if (!process.env.INTEGRATION_ENCRYPTION_KEY) {
    throw new Error(
      'Credential encryption is not configured. Add INTEGRATION_ENCRYPTION_KEY before connecting WhatsApp.',
    );
  }

  const verifiedPhone = await verifyMetaWhatsAppAccess({
    wabaId,
    phoneNumberId,
    accessToken,
  });

  const displayPhoneNumber =
    verifiedPhone.display_phone_number?.trim() || null;
  const verifiedName = verifiedPhone.verified_name?.trim() || null;
  const accountName =
    verifiedName || displayPhoneNumber || 'WhatsApp Business';
  const now = new Date().toISOString();
  const admin = createAdminClient();

  const { data: rawExistingPhone, error: existingPhoneError } = await admin
    .from('whatsapp_accounts')
    .select('id, organization_id')
    .eq('phone_number_id', phoneNumberId)
    .maybeSingle();

  if (existingPhoneError) {
    throw new Error(
      `Unable to inspect the WhatsApp phone mapping: ${existingPhoneError.message}`,
    );
  }

  const existingPhone = rawExistingPhone as unknown as ExistingPhoneRow | null;

  if (
    existingPhone &&
    existingPhone.organization_id !== organizationId
  ) {
    throw new Error(
      'This WhatsApp phone number is already assigned to another workspace.',
    );
  }

  const { data: connectedConnections, error: connectedConnectionsError } =
    await admin
      .from('integration_connections')
      .select('id, external_account_id')
      .eq('organization_id', organizationId)
      .eq('provider', 'whatsapp')
      .eq('status', 'connected');

  if (connectedConnectionsError) {
    throw new Error(
      `Unable to inspect the workspace WhatsApp connection: ${connectedConnectionsError.message}`,
    );
  }

  const differentConnectedAccount = (connectedConnections ?? []).find(
    (connection) =>
      String(connection.external_account_id ?? '') !== wabaId,
  );

  if (differentConnectedAccount) {
    throw new Error(
      'This workspace already has a different connected WhatsApp Business Account. Disconnect it before connecting another one.',
    );
  }

  const { data: rawExistingConnection, error: existingConnectionError } =
    await admin
      .from('integration_connections')
      .select('id, status, external_account_id')
      .eq('organization_id', organizationId)
      .eq('provider', 'whatsapp')
      .eq('external_account_id', wabaId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

  if (existingConnectionError) {
    throw new Error(
      `Unable to inspect the saved WhatsApp connection: ${existingConnectionError.message}`,
    );
  }

  const existingConnection =
    rawExistingConnection as unknown as ExistingConnectionRow | null;
  const connectionWasConnected = existingConnection?.status === 'connected';
  const encryptedToken = encryptIntegrationSecret(accessToken);

  const connectionPayload = {
    auth_mode: authMode,
    external_account_id: wabaId,
    account_name: accountName,
    account_email: null,
    scopes:
      input.scopes && input.scopes.length > 0
        ? Array.from(
            new Set(
              input.scopes
                .map((scope) => scope.trim())
                .filter(Boolean),
            ),
          )
        : [
            'whatsapp_business_management',
            'whatsapp_business_messaging',
          ],
    access_token_ciphertext: encryptedToken,
    refresh_token_ciphertext: null,
    token_expires_at: input.tokenExpiresAt ?? null,
    token_type: input.tokenType?.trim() || 'bearer',
    provider_metadata: {
      ...(input.providerMetadata ?? {}),
      credential_source: credentialSource,
      phone_number_id: phoneNumberId,
      display_phone_number: displayPhoneNumber,
      verified_name: verifiedName,
      quality_rating: verifiedPhone.quality_rating ?? null,
      name_status: verifiedPhone.name_status ?? null,
    },
    connected_by: actorUserId,
    last_verified_at: now,
    last_error: null,
  };

  let connectionId = existingConnection?.id ?? null;

  try {
    if (connectionId) {
      const { error } = await admin
        .from('integration_connections')
        .update({
          ...connectionPayload,
          status: connectionWasConnected ? 'connected' : 'pending',
        })
        .eq('id', connectionId)
        .eq('organization_id', organizationId)
        .eq('provider', 'whatsapp');

      if (error) {
        throw new Error(error.message);
      }
    } else {
      const { data, error } = await admin
        .from('integration_connections')
        .insert({
          organization_id: organizationId,
          provider: 'whatsapp',
          status: 'pending',
          parent_connection_id: null,
          connected_at: null,
          ...connectionPayload,
        })
        .select('id')
        .single();

      if (error || !data?.id) {
        throw new Error(
          error?.message ?? 'Unable to create the workspace WhatsApp connection.',
        );
      }

      connectionId = String(data.id);
    }

    let whatsappAccountId = existingPhone?.id ?? null;

    if (whatsappAccountId) {
      const { error } = await admin
        .from('whatsapp_accounts')
        .update({
          connection_id: connectionId,
          display_phone_number: displayPhoneNumber,
          active: true,
          is_default: false,
        })
        .eq('id', whatsappAccountId)
        .eq('organization_id', organizationId);

      if (error) {
        throw new Error(error.message);
      }
    } else {
      const { data, error } = await admin
        .from('whatsapp_accounts')
        .insert({
          organization_id: organizationId,
          connection_id: connectionId,
          phone_number_id: phoneNumberId,
          display_phone_number: displayPhoneNumber,
          active: true,
          is_default: false,
        })
        .select('id')
        .single();

      if (error || !data?.id) {
        throw new Error(
          error?.message ?? 'Unable to save the WhatsApp phone number.',
        );
      }

      whatsappAccountId = String(data.id);
    }

    const { error: clearDefaultError } = await admin
      .from('whatsapp_accounts')
      .update({ is_default: false })
      .eq('organization_id', organizationId)
      .eq('is_default', true);

    if (clearDefaultError) {
      throw new Error(clearDefaultError.message);
    }

    const { error: setDefaultError } = await admin
      .from('whatsapp_accounts')
      .update({ is_default: true })
      .eq('id', whatsappAccountId)
      .eq('organization_id', organizationId)
      .eq('connection_id', connectionId);

    if (setDefaultError) {
      throw new Error(setDefaultError.message);
    }

    const { error: assetsError } = await admin
      .from('integration_assets')
      .upsert(
        [
          {
            organization_id: organizationId,
            connection_id: connectionId,
            asset_type: 'whatsapp_business_account',
            external_id: wabaId,
            name: verifiedName || 'WhatsApp Business Account',
            status: 'selected',
            is_selected: true,
            metadata: { waba_id: wabaId },
            discovered_at: now,
          },
          {
            organization_id: organizationId,
            connection_id: connectionId,
            asset_type: 'whatsapp_phone_number',
            external_id: phoneNumberId,
            name: displayPhoneNumber || phoneNumberId,
            status: 'selected',
            is_selected: true,
            metadata: {
              waba_id: wabaId,
              display_phone_number: displayPhoneNumber,
              verified_name: verifiedName,
              quality_rating: verifiedPhone.quality_rating ?? null,
              name_status: verifiedPhone.name_status ?? null,
            },
            discovered_at: now,
          },
        ],
        {
          onConflict: 'connection_id,asset_type,external_id',
        },
      );

    if (assetsError) {
      throw new Error(assetsError.message);
    }

    const { error: finalConnectionError } = await admin
      .from('integration_connections')
      .update({
        status: 'connected',
        connected_at: now,
        last_verified_at: now,
        last_error: null,
      })
      .eq('id', connectionId)
      .eq('organization_id', organizationId)
      .eq('provider', 'whatsapp');

    if (finalConnectionError) {
      throw new Error(finalConnectionError.message);
    }

    await admin.from('integration_audit_log').insert({
      organization_id: organizationId,
      connection_id: connectionId,
      provider: 'whatsapp',
      event_type: existingConnection ? 'reconnected' : 'connected',
      actor_user_id: actorUserId,
      detail: {
        auth_mode: authMode,
        waba_id: wabaId,
        phone_number_id: phoneNumberId,
        display_phone_number: displayPhoneNumber,
        verified_name: verifiedName,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Unable to save the WhatsApp connection.';

    if (connectionId && !connectionWasConnected) {
      await admin
        .from('integration_connections')
        .update({
          status: 'error',
          last_error: message.slice(0, 1000),
        })
        .eq('id', connectionId)
        .eq('organization_id', organizationId)
        .eq('provider', 'whatsapp');
    }

    throw new Error(message);
  }

  return {
    connectionId,
    phoneNumberId,
    displayPhoneNumber,
    verifiedName,
  };
}
