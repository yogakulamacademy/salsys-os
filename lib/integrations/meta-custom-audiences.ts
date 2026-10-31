import 'server-only';

import {
  inspectMetaAccessToken,
  metaGraphVersion,
} from '@/lib/integrations/meta';

type MetaGraphError = {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
};

type MetaCustomAudienceRow = {
  id?: unknown;
  name?: unknown;
  subtype?: unknown;
};

type MetaCustomAudiencesEnvelope = {
  data?: MetaCustomAudienceRow[];
  paging?: {
    next?: string;
  };
  error?: MetaGraphError;
};

export type DiscoveredMetaCustomAudience = {
  id: string;
  name: string;
  subtype: string | null;
};

function nonEmptyString(value: unknown) {
  return typeof value === 'string' &&
    value.trim()
    ? value.trim()
    : null;
}

function numericId(value: string) {
  return /^\d+$/.test(
    value.trim(),
  );
}

async function metaGet(
  url: string,
  accessToken: string,
) {
  const response =
    await fetch(
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
    | MetaCustomAudiencesEnvelope
    | null =
    null;

  try {
    payload = rawText
      ? JSON.parse(
          rawText,
        ) as MetaCustomAudiencesEnvelope
      : {};
  } catch {
    throw new Error(
      `Meta Custom Audience discovery returned non-JSON data (HTTP ${response.status}).`,
    );
  }

  if (
    !response.ok ||
    payload.error
  ) {
    const providerCode =
      payload.error?.code != null
        ? ` code=${payload.error.code}`
        : '';

    const providerSubcode =
      payload.error?.error_subcode != null
        ? ` subcode=${payload.error.error_subcode}`
        : '';

    throw new Error(
      `Meta Custom Audience discovery failed (HTTP ${response.status}${providerCode}${providerSubcode}).`,
    );
  }

  return payload;
}

/**
 * Read-only Custom Audience discovery for the selected Meta ad account.
 *
 * This function never resolves CRM people, uploads identifiers, creates an
 * audience, or changes provider state. It returns only safe audience metadata
 * needed to choose an internal activation destination.
 */
export async function discoverMetaCustomAudiences(input: {
  accessToken: string;
  adAccountId: string;
}) {
  const adAccountId =
    input.adAccountId
      .replace(/^act_/i, '')
      .trim();

  if (!numericId(adAccountId)) {
    throw new Error(
      'Meta ad account ID is missing or invalid.',
    );
  }

  const inspection =
    await inspectMetaAccessToken(
      input.accessToken,
    );

  const scopes =
    new Set(
      inspection.scopes.map(
        (scope) =>
          scope.toLowerCase(),
      ),
    );

  if (
    !scopes.has(
      'ads_management',
    )
  ) {
    throw new Error(
      'Meta Custom Audience discovery requires ads_management. Update the Meta Login for Business configuration and reconnect Meta first.',
    );
  }

  const version =
    metaGraphVersion();

  const firstUrl =
    new URL(
      `https://graph.facebook.com/${version}/act_${adAccountId}/customaudiences`,
    );

  firstUrl.searchParams.set(
    'fields',
    'id,name,subtype',
  );

  firstUrl.searchParams.set(
    'limit',
    '100',
  );

  let nextUrl:
    | string
    | undefined =
    firstUrl.toString();

  const audiences =
    new Map<
      string,
      DiscoveredMetaCustomAudience
    >();

  let pages = 0;
  let truncated = false;

  while (nextUrl) {
    pages += 1;

    if (
      pages > 10 ||
      audiences.size >= 500
    ) {
      truncated = true;
      break;
    }

    const payload =
      await metaGet(
        nextUrl,
        input.accessToken,
      );

    const rows =
      Array.isArray(
        payload.data,
      )
        ? payload.data
        : [];

    for (const row of rows) {
      const id =
        nonEmptyString(
          row.id,
        );

      if (
        !id ||
        !numericId(id)
      ) {
        continue;
      }

      audiences.set(
        id,
        {
          id,
          name:
            nonEmptyString(
              row.name,
            ) ??
            `Meta Custom Audience ${id}`,
          subtype:
            nonEmptyString(
              row.subtype,
            ),
        },
      );

      if (
        audiences.size >= 500
      ) {
        truncated =
          Boolean(
            payload.paging?.next,
          );
        break;
      }
    }

    nextUrl =
      audiences.size >= 500
        ? undefined
        : payload.paging?.next;
  }

  return {
    adAccountId,
    audiences:
      Array.from(
        audiences.values(),
      ),
    truncated,
  };
}