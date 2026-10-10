import 'server-only';

import {
  inspectMetaAccessToken,
  metaGraphVersion,
} from '@/lib/integrations/meta';
import {
  connectWhatsAppForOrganization,
  type ConnectWhatsAppResult,
} from '@/lib/integrations/whatsapp-connect';

const REQUIRED_WHATSAPP_SCOPES = [
  'whatsapp_business_management',
  'whatsapp_business_messaging',
] as const;

type MetaTokenResponse = {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
  };
};

type MetaPhoneNumber = {
  id?: string;
};

type MetaPhoneListResponse = {
  data?: MetaPhoneNumber[];
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
  };
};

export type CompleteWhatsAppEmbeddedSignupInput = {
  organizationId: string;
  actorUserId: string;
  code: string;
  wabaId: string;
  phoneNumberId?: string | null;
};

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is not configured.`);
  }

  return value;
}

function requiredNumericId(value: string, label: string) {
  const normalized = value.trim();

  if (!normalized || !/^\d+$/.test(normalized)) {
    throw new Error(`${label} is invalid.`);
  }

  return normalized;
}

function optionalNumericId(
  value: string | null | undefined,
  label: string,
) {
  const normalized = value?.trim() ?? '';

  if (!normalized) {
    return null;
  }

  if (!/^\d+$/.test(normalized)) {
    throw new Error(`${label} is invalid.`);
  }

  return normalized;
}

async function readJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function metaErrorMessage(
  payload:
    | MetaTokenResponse
    | MetaPhoneListResponse
    | null,
  fallback: string,
) {
  return payload?.error?.message?.trim() || fallback;
}

export function whatsappEmbeddedSignupPublicConfiguration() {
  const graphVersion = metaGraphVersion();

  return {
    appId: requiredEnv('META_APP_ID'),
    configId: requiredEnv(
      'WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID',
    ),
    graphVersion,
  };
}

async function exchangeEmbeddedSignupCode(code: string) {
  const normalizedCode = code.trim();

  if (!normalizedCode) {
    throw new Error(
      'Meta did not return a WhatsApp Embedded Signup authorization code.',
    );
  }

  const appId = requiredEnv('META_APP_ID');
  const appSecret = requiredEnv('META_APP_SECRET');
  const version = metaGraphVersion();

  const url = new URL(
    `https://graph.facebook.com/${version}/oauth/access_token`,
  );

  url.searchParams.set('client_id', appId);
  url.searchParams.set('client_secret', appSecret);
  url.searchParams.set('code', normalizedCode);

  let response: Response;

  try {
    response = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
    });
  } catch {
    throw new Error(
      'Unable to reach Meta while exchanging the WhatsApp authorization code.',
    );
  }

  const payload = await readJson<MetaTokenResponse>(response);

  if (!response.ok || !payload?.access_token) {
    throw new Error(
      `Meta could not exchange the WhatsApp authorization code: ${metaErrorMessage(
        payload,
        `HTTP ${response.status}`,
      )}`,
    );
  }

  return {
    accessToken: payload.access_token.trim(),
    tokenType: payload.token_type?.trim() || 'bearer',
    expiresIn:
      typeof payload.expires_in === 'number' &&
      Number.isFinite(payload.expires_in)
        ? payload.expires_in
        : null,
  };
}

async function discoverSinglePhoneNumberId({
  wabaId,
  accessToken,
}: {
  wabaId: string;
  accessToken: string;
}) {
  const version = metaGraphVersion();

  let response: Response;

  try {
    response = await fetch(
      `https://graph.facebook.com/${version}/${encodeURIComponent(
        wabaId,
      )}/phone_numbers?fields=id&limit=100`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: 'no-store',
      },
    );
  } catch {
    throw new Error(
      'Unable to reach Meta while discovering the WhatsApp phone number.',
    );
  }

  const payload = await readJson<MetaPhoneListResponse>(response);

  if (!response.ok) {
    throw new Error(
      `Meta could not load the WhatsApp phone numbers: ${metaErrorMessage(
        payload,
        `HTTP ${response.status}`,
      )}`,
    );
  }

  const ids = (payload?.data ?? [])
    .map((phone) => String(phone.id ?? '').trim())
    .filter((id) => /^\d+$/.test(id));

  if (ids.length !== 1) {
    throw new Error(
      ids.length === 0
        ? 'Meta did not return a phone number for this WhatsApp Business Account.'
        : 'Meta did not identify which WhatsApp phone number was selected. Please run Embedded Signup again and select one phone number.',
    );
  }

  return ids[0];
}

export async function completeWhatsAppEmbeddedSignup(
  input: CompleteWhatsAppEmbeddedSignupInput,
): Promise<ConnectWhatsAppResult> {
  const organizationId = input.organizationId.trim();
  const actorUserId = input.actorUserId.trim();
  const wabaId = requiredNumericId(
    input.wabaId,
    'WhatsApp Business Account ID',
  );
  const suppliedPhoneNumberId = optionalNumericId(
    input.phoneNumberId,
    'Phone Number ID',
  );

  if (!organizationId || !actorUserId) {
    throw new Error('Workspace authorization is incomplete.');
  }

  const token = await exchangeEmbeddedSignupCode(input.code);
  const inspection = await inspectMetaAccessToken(token.accessToken);

  const grantedScopes = new Set<string>([
    ...inspection.scopes,
    ...inspection.granularScopes.map((scope) => scope.scope),
  ]);

  for (const requiredScope of REQUIRED_WHATSAPP_SCOPES) {
    if (!grantedScopes.has(requiredScope)) {
      throw new Error(
        `Meta did not grant the required ${requiredScope} permission.`,
      );
    }
  }

  const targetedWabaIds = new Set(
    inspection.granularScopes
      .filter((scope) =>
        REQUIRED_WHATSAPP_SCOPES.includes(
          scope.scope as (typeof REQUIRED_WHATSAPP_SCOPES)[number],
        ),
      )
      .flatMap((scope) => scope.targetIds),
  );

  if (
    targetedWabaIds.size > 0 &&
    !targetedWabaIds.has(wabaId)
  ) {
    throw new Error(
      'The WhatsApp Business Account returned by Embedded Signup is not included in the granted Meta assets.',
    );
  }

  const phoneNumberId =
    suppliedPhoneNumberId ??
    (await discoverSinglePhoneNumberId({
      wabaId,
      accessToken: token.accessToken,
    }));

  const tokenExpiresAt =
    inspection.expiresAt && inspection.expiresAt > 0
      ? new Date(inspection.expiresAt * 1000).toISOString()
      : token.expiresIn && token.expiresIn > 0
        ? new Date(Date.now() + token.expiresIn * 1000).toISOString()
        : null;

  return connectWhatsAppForOrganization({
    organizationId,
    actorUserId,
    wabaId,
    phoneNumberId,
    accessToken: token.accessToken,
    authMode: 'embedded_signup',
    credentialSource: 'meta_embedded_signup',
    scopes: Array.from(grantedScopes),
    tokenExpiresAt,
    tokenType: token.tokenType,
    providerMetadata: {
      token_subject_type: inspection.type,
      token_subject_id: inspection.userId,
      application: inspection.application,
      issued_at: inspection.issuedAt,
      data_access_expires_at: inspection.dataAccessExpiresAt,
      granular_scopes: inspection.granularScopes,
      embedded_signup_config_id: requiredEnv(
        'WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID',
      ),
    },
  });
}
