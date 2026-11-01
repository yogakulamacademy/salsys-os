import 'server-only';

import { decryptIntegrationSecret } from '@/lib/integrations/crypto';
import { createAdminClient } from '@/lib/supabase/admin';

const DEFAULT_WHATSAPP_API_VERSION = 'v26.0';

type WhatsAppConnectionRow = {
  id: string;
  organization_id: string;
  provider: string;
  status: string;
  external_account_id: string | null;
  account_name: string | null;
  access_token_ciphertext: string | null;
};

type MetaResponse = {
  success?: boolean;
  error?: {
    message?: string;
  };
};

export type RemoveWhatsAppInput = {
  organizationId: string;
  actorUserId: string;
  connectionId: string;
};

export type RemoveWhatsAppResult = {
  connectionId: string;
  providerUnsubscribed: boolean;
  providerWarning: string | null;
};

function apiVersion() {
  const configured = process.env.WA_API_VERSION?.trim();
  return configured && /^v\d+\.\d+$/.test(configured)
    ? configured
    : DEFAULT_WHATSAPP_API_VERSION;
}

async function readMetaResponse(response: Response): Promise<MetaResponse> {
  try {
    return (await response.json()) as MetaResponse;
  } catch {
    return {};
  }
}

async function unsubscribeFromWaba({
  wabaId,
  accessToken,
}: {
  wabaId: string;
  accessToken: string;
}) {
  let response: Response;

  try {
    response = await fetch(
      `https://graph.facebook.com/${apiVersion()}/${encodeURIComponent(
        wabaId,
      )}/subscribed_apps`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: 'no-store',
      },
    );
  } catch {
    return {
      ok: false,
      warning:
        'SalsysOS removed the local connection, but Meta could not be reached to remove the WABA webhook subscription.',
    };
  }

  const payload = await readMetaResponse(response);

  if (!response.ok || payload.success === false) {
    return {
      ok: false,
      warning:
        payload.error?.message?.trim() ||
        `SalsysOS removed the local connection, but Meta did not confirm WABA webhook removal (HTTP ${response.status}).`,
    };
  }

  return { ok: true, warning: null };
}

export async function removeWhatsAppForOrganization(
  input: RemoveWhatsAppInput,
): Promise<RemoveWhatsAppResult> {
  const organizationId = input.organizationId.trim();
  const actorUserId = input.actorUserId.trim();
  const connectionId = input.connectionId.trim();

  if (!organizationId || !actorUserId || !connectionId) {
    throw new Error('WhatsApp removal authorization is incomplete.');
  }

  const admin = createAdminClient();
  const { data: rawConnection, error: connectionError } = await admin
    .from('integration_connections')
    .select(
      'id,organization_id,provider,status,external_account_id,account_name,access_token_ciphertext',
    )
    .eq('id', connectionId)
    .eq('organization_id', organizationId)
    .eq('provider', 'whatsapp')
    .maybeSingle();

  if (connectionError || !rawConnection) {
    throw new Error(
      connectionError?.message ||
        'WhatsApp connection was not found for this workspace.',
    );
  }

  const connection = rawConnection as unknown as WhatsAppConnectionRow;
  if (
    connection.id !== connectionId ||
    connection.organization_id !== organizationId ||
    connection.provider !== 'whatsapp'
  ) {
    throw new Error('WhatsApp connection was not found for this workspace.');
  }

  let providerUnsubscribed = false;
  let providerWarning: string | null = null;
  const wabaId = connection.external_account_id?.trim() || '';

  if (wabaId && connection.access_token_ciphertext) {
    try {
      const accessToken = decryptIntegrationSecret(
        connection.access_token_ciphertext,
      ).trim();

      if (accessToken) {
        const result = await unsubscribeFromWaba({ wabaId, accessToken });
        providerUnsubscribed = result.ok;
        providerWarning = result.warning;
      }
    } catch {
      providerWarning =
        'SalsysOS removed the local connection, but the saved Meta credential could not be used to remove the WABA webhook subscription.';
    }
  } else if (wabaId) {
    providerWarning =
      'SalsysOS removed the local connection. No saved Meta credential was available to remove the WABA webhook subscription.';
  }

  /*
   * The provider operation is necessarily external. Everything local after it
   * is one database transaction: phone mappings, assets, encrypted
   * credentials, connection status and audit evidence either all finalize or
   * all roll back together.
   */
  const { error: finalizeError } = await admin.rpc(
    'finalize_whatsapp_removal_v1',
    {
      p_organization_id: organizationId,
      p_connection_id: connectionId,
      p_actor_user_id: actorUserId,
      p_provider_unsubscribed: providerUnsubscribed,
      p_provider_warning: providerWarning,
    },
  );

  if (finalizeError) {
    throw new Error(
      `Unable to finalize the WhatsApp removal: ${finalizeError.message}`,
    );
  }

  return {
    connectionId,
    providerUnsubscribed,
    providerWarning,
  };
}
