import 'server-only';

import {
  inspectMetaAccessToken,
  metaGraphVersion,
} from '@/lib/integrations/meta';

type MetaAdAccountApiRow = {
  id?: unknown;
  account_id?: unknown;
  name?: unknown;
  account_status?: unknown;
  currency?: unknown;
  timezone_name?: unknown;
};

type MetaAdAccountsEnvelope = {
  data?: MetaAdAccountApiRow[];
  paging?: {
    next?: string;
  };
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
};

export type DiscoveredMetaAdAccount = {
  asset_type: 'meta_ad_account';
  external_id: string;
  name: string;
  metadata: Record<string, unknown>;
};

function nonEmptyString(value: unknown) {
  return typeof value === 'string' && value.trim()
    ? value.trim()
    : null;
}

function normalizeAdAccountId(value: string) {
  return value.replace(/^act_/i, '').trim();
}

async function metaGet<T>(
  url: string,
  accessToken: string,
): Promise<T> {
  const response = await fetch(
    url,
    {
      method: 'GET',
      headers: {
        Authorization:
          `Bearer ${accessToken}`,
      },
      cache: 'no-store',
    },
  );

  const rawText =
    await response.text();

  let payload:
    | MetaAdAccountsEnvelope
    | null =
    null;

  try {
    payload = rawText
      ? JSON.parse(
          rawText,
        ) as MetaAdAccountsEnvelope
      : {};
  } catch {
    throw new Error(
      `Meta API returned non-JSON data (HTTP ${response.status}).`,
    );
  }

  if (
    !response.ok ||
    payload?.error
  ) {
    const error =
      payload?.error;

    const parts = [
      error?.message,
      error?.type
        ? `type=${error.type}`
        : null,
      error?.code != null
        ? `code=${error.code}`
        : null,
      error?.error_subcode != null
        ? `subcode=${error.error_subcode}`
        : null,
      error?.fbtrace_id
        ? `fbtrace_id=${error.fbtrace_id}`
        : null,
    ].filter(Boolean);

    throw new Error(
      parts.join(' | ') ||
        rawText ||
        `Meta API request failed with HTTP ${response.status}.`,
    );
  }

  return payload as T;
}

export async function discoverMetaAdAccounts(
  accessToken: string,
) {
  const inspection =
    await inspectMetaAccessToken(
      accessToken,
    );

  const grantedScopes =
    new Set(
      inspection.scopes.map(
        (scope) =>
          scope.toLowerCase(),
      ),
    );

  if (
    !grantedScopes.has(
      'ads_read',
    ) &&
    !grantedScopes.has(
      'ads_management',
    )
  ) {
    throw new Error(
      'Meta Ads permission is missing. Update the Meta Login for Business configuration to grant ads_read (or ads_management), then reconnect Meta before discovering ad accounts.',
    );
  }

  const version =
    metaGraphVersion();

  const firstUrl =
    new URL(
      `https://graph.facebook.com/${version}/me/adaccounts`,
    );

  firstUrl.searchParams.set(
    'fields',
    [
      'id',
      'account_id',
      'name',
      'account_status',
      'currency',
      'timezone_name',
    ].join(','),
  );

  firstUrl.searchParams.set(
    'limit',
    '100',
  );

  let nextUrl:
    | string
    | undefined =
    firstUrl.toString();

  const discovered =
    new Map<
      string,
      DiscoveredMetaAdAccount
    >();

  while (nextUrl) {
    const payload:
      MetaAdAccountsEnvelope =
      await metaGet<MetaAdAccountsEnvelope>(
        nextUrl,
        accessToken,
      );

    const rows =
      Array.isArray(
        payload.data,
      )
        ? payload.data
        : [];

    for (const row of rows) {
      const rawId =
        nonEmptyString(
          row.account_id,
        ) ??
        nonEmptyString(
          row.id,
        );

      if (!rawId) {
        continue;
      }

      const accountId =
        normalizeAdAccountId(
          rawId,
        );

      if (!accountId) {
        continue;
      }

      const name =
        nonEmptyString(
          row.name,
        ) ??
        `Meta Ad Account ${accountId}`;

      discovered.set(
        accountId,
        {
          asset_type:
            'meta_ad_account',
          external_id:
            accountId,
          name,
          metadata: {
            account_status:
              row.account_status ??
              null,
            currency:
              nonEmptyString(
                row.currency,
              ),
            timezone_name:
              nonEmptyString(
                row.timezone_name,
              ),
            graph_resource:
              `act_${accountId}`,
          },
        },
      );
    }

    nextUrl =
      payload.paging?.next;
  }

  return {
    assets:
      Array.from(
        discovered.values(),
      ),
    scopes:
      inspection.scopes,
  };
}