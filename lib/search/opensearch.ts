import 'server-only';

import { createHash, createHmac } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';

type SearchClaim = {
  outbox_id: string;
  entity_type: string;
  entity_id: string;
  operation: 'upsert' | 'delete';
  revision: number;
  lease_token: string;
};

type PreparedAction = {
  claim: SearchClaim;
  operation: 'index' | 'delete';
  documentId: string;
  document?: Record<string, unknown>;
};

type HeaderAuth = {
  mode: 'header';
  authorization: string;
};

type AwsSigV4Auth = {
  mode: 'aws-sigv4';
  region: string;
  service: 'aoss' | 'es';
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string | null;
};

export type OpenSearchConfig = {
  endpoint: string;
  indexName: string;
  auth: HeaderAuth | AwsSigV4Auth;
  /**
   * Backward-compatible field for modules that still use the original
   * Basic/Bearer provider path. It is intentionally empty in AWS SigV4 mode.
   * Semantic OpenSearch will be migrated in its own provider checkpoint before
   * that feature is enabled.
   */
  authorization: string;
};

function env(name: string) {
  const value = process.env[name]?.trim();
  return value || null;
}

function cleanEndpoint(raw: string) {
  const url = new URL(raw);
  if (!['https:', 'http:'].includes(url.protocol)) {
    throw new Error('OPENSEARCH_URL must use http or https.');
  }
  url.pathname = url.pathname.replace(/\/+$/, '');
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

function safeIndexPart(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

function awsService(value: string | null): 'aoss' | 'es' {
  const normalized = (value || 'aoss').toLowerCase();
  if (normalized !== 'aoss' && normalized !== 'es') {
    throw new Error('OPENSEARCH_AWS_SERVICE must be aoss or es.');
  }
  return normalized;
}

export function getOpenSearchConfig(): OpenSearchConfig {
  const endpointRaw = env('OPENSEARCH_URL');
  if (!endpointRaw) throw new Error('OPENSEARCH_URL is not configured.');

  const bearer = env('OPENSEARCH_BEARER_TOKEN');
  const username = env('OPENSEARCH_USERNAME');
  const password = env('OPENSEARCH_PASSWORD');
  const awsRegion = env('OPENSEARCH_AWS_REGION') || env('AWS_REGION') || env('AWS_DEFAULT_REGION');
  const awsAccessKeyId = env('AWS_ACCESS_KEY_ID');
  const awsSecretAccessKey = env('AWS_SECRET_ACCESS_KEY');
  const awsSessionToken = env('AWS_SESSION_TOKEN');

  let auth: HeaderAuth | AwsSigV4Auth;
  let authorization = '';

  if (bearer) {
    authorization = `Bearer ${bearer}`;
    auth = { mode: 'header', authorization };
  } else if (username && password) {
    authorization = `Basic ${Buffer.from(`${username}:${password}`, 'utf8').toString('base64')}`;
    auth = { mode: 'header', authorization };
  } else if (awsRegion && awsAccessKeyId && awsSecretAccessKey) {
    auth = {
      mode: 'aws-sigv4',
      region: awsRegion,
      service: awsService(env('OPENSEARCH_AWS_SERVICE')),
      accessKeyId: awsAccessKeyId,
      secretAccessKey: awsSecretAccessKey,
      sessionToken: awsSessionToken,
    };
  } else {
    throw new Error(
      'OpenSearch credentials are not configured. Configure Bearer/Basic auth or AWS SigV4 credentials.',
    );
  }

  const prefix = safeIndexPart(env('OPENSEARCH_INDEX_PREFIX') || 'salsys');
  if (!prefix) throw new Error('Invalid OPENSEARCH_INDEX_PREFIX.');

  return {
    endpoint: cleanEndpoint(endpointRaw),
    indexName: `${prefix}-global-v1`,
    auth,
    authorization,
  };
}

function sha256Hex(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function hmac(key: Buffer | string, value: string) {
  return createHmac('sha256', key).update(value, 'utf8').digest();
}

function rfc3986(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function canonicalPath(url: URL) {
  if (!url.pathname) return '/';
  return url.pathname
    .split('/')
    .map((segment) => {
      try {
        return rfc3986(decodeURIComponent(segment));
      } catch {
        return rfc3986(segment);
      }
    })
    .join('/') || '/';
}

function canonicalQuery(url: URL) {
  const values: Array<[string, string]> = [];
  url.searchParams.forEach((value, key) => values.push([key, value]));
  values.sort(([keyA, valueA], [keyB, valueB]) => {
    const encodedKeyA = rfc3986(keyA);
    const encodedKeyB = rfc3986(keyB);
    if (encodedKeyA !== encodedKeyB) return encodedKeyA.localeCompare(encodedKeyB);
    return rfc3986(valueA).localeCompare(rfc3986(valueB));
  });
  return values.map(([key, value]) => `${rfc3986(key)}=${rfc3986(value)}`).join('&');
}

function amzTimestamp(date: Date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

function bodyString(body: BodyInit | null | undefined) {
  if (body == null) return '';
  if (typeof body === 'string') return body;
  throw new Error('AWS SigV4 OpenSearch requests currently require a string request body.');
}

function signAwsRequest(
  auth: AwsSigV4Auth,
  url: URL,
  init: RequestInit,
) {
  const now = new Date();
  const amzDate = amzTimestamp(now);
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(bodyString(init.body));
  const requestHeaders = new Headers(init.headers || {});

  requestHeaders.set('x-amz-date', amzDate);
  requestHeaders.set('x-amz-content-sha256', payloadHash);
  if (auth.sessionToken) requestHeaders.set('x-amz-security-token', auth.sessionToken);

  const signedHeaderNames = [
    'host',
    'x-amz-content-sha256',
    'x-amz-date',
    ...(auth.sessionToken ? ['x-amz-security-token'] : []),
  ];
  const canonicalHeaders = [
    `host:${url.host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`,
    ...(auth.sessionToken ? [`x-amz-security-token:${auth.sessionToken}`] : []),
  ].join('\n') + '\n';
  const signedHeaders = signedHeaderNames.join(';');
  const canonicalRequest = [
    (init.method || 'GET').toUpperCase(),
    canonicalPath(url),
    canonicalQuery(url),
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');
  const credentialScope = `${dateStamp}/${auth.region}/${auth.service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');
  const dateKey = hmac(`AWS4${auth.secretAccessKey}`, dateStamp);
  const regionKey = hmac(dateKey, auth.region);
  const serviceKey = hmac(regionKey, auth.service);
  const signingKey = hmac(serviceKey, 'aws4_request');
  const signature = createHmac('sha256', signingKey).update(stringToSign, 'utf8').digest('hex');

  requestHeaders.set(
    'Authorization',
    `AWS4-HMAC-SHA256 Credential=${auth.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  );

  return requestHeaders;
}

export async function openSearchFetch(
  config: OpenSearchConfig,
  pathOrUrl: string,
  init: RequestInit = {},
) {
  const url = /^https?:\/\//i.test(pathOrUrl)
    ? new URL(pathOrUrl)
    : new URL(pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`, `${config.endpoint}/`);
  const requestHeaders = new Headers(init.headers || {});
  if (!requestHeaders.has('Accept')) requestHeaders.set('Accept', 'application/json');

  if (config.auth.mode === 'header') {
    requestHeaders.set('Authorization', config.auth.authorization);
  } else {
    const signed = signAwsRequest(config.auth, url, { ...init, headers: requestHeaders });
    signed.forEach((value, key) => requestHeaders.set(key, value));
  }

  return fetch(url, {
    ...init,
    headers: requestHeaders,
    cache: init.cache || 'no-store',
  });
}

function opensearchUrl(config: OpenSearchConfig, path: string) {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${config.endpoint}${cleanPath}`;
}

const INDEX_MAPPING = {
  settings: {
    number_of_shards: 1,
    number_of_replicas: 1,
  },
  mappings: {
    dynamic: false,
    properties: {
      organization_id: { type: 'keyword' },
      entity_type: { type: 'keyword' },
      entity_id: { type: 'keyword' },
      lead_id: { type: 'keyword' },
      conversation_id: { type: 'keyword' },
      document_id: { type: 'keyword' },
      lead_code: { type: 'keyword' },
      display_name: {
        type: 'text',
        fields: { keyword: { type: 'keyword', ignore_above: 256 } },
      },
      stage: { type: 'keyword' },
      status: { type: 'keyword' },
      intent: { type: 'keyword' },
      channel: { type: 'keyword' },
      direction: { type: 'keyword' },
      message_type: { type: 'keyword' },
      preferred_location: { type: 'text' },
      preferred_mode: { type: 'keyword' },
      country: { type: 'keyword' },
      lead_origin: { type: 'keyword' },
      lead_creation_channel: { type: 'keyword' },
      first_touch_source: { type: 'keyword' },
      first_touch_medium: { type: 'keyword' },
      first_touch_campaign: { type: 'text' },
      last_touch_source: { type: 'keyword' },
      last_touch_medium: { type: 'keyword' },
      last_touch_campaign: { type: 'text' },
      summary: { type: 'text' },
      body: { type: 'text' },
      content: { type: 'text' },
      content_hash: { type: 'keyword' },
      document_title: { type: 'text' },
      document_category: { type: 'keyword' },
      document_version: { type: 'integer' },
      chunk_index: { type: 'integer' },
      preferred_month: { type: 'date', ignore_malformed: true },
      started_at: { type: 'date', ignore_malformed: true },
      last_message_at: { type: 'date', ignore_malformed: true },
      sent_at: { type: 'date', ignore_malformed: true },
      received_at: { type: 'date', ignore_malformed: true },
      created_at: { type: 'date', ignore_malformed: true },
      updated_at: { type: 'date', ignore_malformed: true },
    },
  },
};

export async function ensureOpenSearchIndex(config = getOpenSearchConfig()) {
  const indexUrl = opensearchUrl(config, `/${encodeURIComponent(config.indexName)}`);
  const head = await openSearchFetch(config, indexUrl, {
    method: 'HEAD',
  });

  if (head.ok) return;
  if (head.status !== 404) {
    throw new Error(`OpenSearch index check failed with HTTP ${head.status}.`);
  }

  const create = await openSearchFetch(config, indexUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(INDEX_MAPPING),
  });

  if (create.ok) return;
  const text = (await create.text()).slice(0, 1000);
  if (create.status === 400 && text.includes('resource_already_exists_exception')) return;
  throw new Error(`OpenSearch index creation failed with HTTP ${create.status}.`);
}

function normalizeClaim(row: Record<string, unknown>): SearchClaim {
  return {
    outbox_id: String(row.outbox_id),
    entity_type: String(row.entity_type),
    entity_id: String(row.entity_id),
    operation: row.operation === 'delete' ? 'delete' : 'upsert',
    revision: Number(row.revision),
    lease_token: String(row.lease_token),
  };
}

async function prepareAction(
  admin: ReturnType<typeof createAdminClient>,
  organizationId: string,
  claim: SearchClaim,
): Promise<PreparedAction> {
  const fallbackDocumentId = `${organizationId}:${claim.entity_type}:${claim.entity_id}`;

  if (claim.operation === 'delete') {
    return { claim, operation: 'delete', documentId: fallbackDocumentId };
  }

  const { data, error } = await admin.rpc('build_search_document_v1', {
    p_organization_id: organizationId,
    p_entity_type: claim.entity_type,
    p_entity_id: claim.entity_id,
  });

  if (error) throw new Error(`Document builder failed: ${error.message}`);

  const result = data && typeof data === 'object' && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : {};

  if (!result.indexable) {
    return {
      claim,
      operation: 'delete',
      documentId: fallbackDocumentId,
    };
  }

  const document = result.document;
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    throw new Error('Document builder returned an invalid search document.');
  }

  const documentId = typeof result.document_id === 'string' && result.document_id
    ? result.document_id
    : fallbackDocumentId;

  return {
    claim,
    operation: 'index',
    documentId,
    document: document as Record<string, unknown>,
  };
}

function bulkBody(config: OpenSearchConfig, actions: PreparedAction[]) {
  const lines: string[] = [];
  for (const action of actions) {
    if (action.operation === 'delete') {
      lines.push(JSON.stringify({
        delete: {
          _index: config.indexName,
          _id: action.documentId,
        },
      }));
      continue;
    }

    lines.push(JSON.stringify({
      index: {
        _index: config.indexName,
        _id: action.documentId,
      },
    }));
    lines.push(JSON.stringify(action.document));
  }
  return `${lines.join('\n')}\n`;
}

function itemError(item: unknown) {
  if (!item || typeof item !== 'object') return 'unknown_bulk_item_error';
  const operation = Object.values(item as Record<string, unknown>)[0];
  if (!operation || typeof operation !== 'object') return 'unknown_bulk_item_error';
  const error = (operation as Record<string, unknown>).error;
  if (!error) return 'opensearch_item_failed';
  if (typeof error === 'string') return error.slice(0, 500);
  if (typeof error === 'object') {
    const value = error as Record<string, unknown>;
    return [value.type, value.reason].filter(Boolean).join(': ').slice(0, 500) || 'opensearch_item_failed';
  }
  return 'opensearch_item_failed';
}

function itemStatus(item: unknown) {
  if (!item || typeof item !== 'object') return 0;
  const operation = Object.values(item as Record<string, unknown>)[0];
  if (!operation || typeof operation !== 'object') return 0;
  return Number((operation as Record<string, unknown>).status || 0);
}

async function finalizeClaim(
  admin: ReturnType<typeof createAdminClient>,
  organizationId: string,
  claim: SearchClaim,
  success: boolean,
  errorMessage?: string,
) {
  const { data, error } = await admin.rpc('complete_search_index_outbox_v1', {
    p_organization_id: organizationId,
    p_outbox_id: claim.outbox_id,
    p_lease_token: claim.lease_token,
    p_claimed_revision: claim.revision,
    p_success: success,
    p_error: errorMessage || null,
  });

  if (error) {
    throw new Error(`Unable to finalize search outbox claim: ${error.message}`);
  }

  return data;
}

export async function runSearchIndexWorkerForOrganization(organizationId: string) {
  const admin = createAdminClient();
  const { data: settings, error: settingsError } = await admin
    .from('search_index_settings')
    .select('indexing_enabled,batch_size')
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (settingsError) throw new Error(`Unable to load search settings: ${settingsError.message}`);
  if (!settings?.indexing_enabled) {
    return { ok: true, organizationId, skipped: true, reason: 'indexing_disabled', claimed: 0, succeeded: 0, failed: 0 };
  }

  const config = getOpenSearchConfig();
  await ensureOpenSearchIndex(config);

  const { data: claimedRows, error: claimError } = await admin.rpc('claim_search_index_outbox_v1', {
    p_organization_id: organizationId,
    p_limit: Number(settings.batch_size || 50),
    p_lease_seconds: 180,
  });

  if (claimError) throw new Error(`Unable to claim search outbox: ${claimError.message}`);

  const claims = Array.isArray(claimedRows)
    ? claimedRows.map((row) => normalizeClaim(row as Record<string, unknown>))
    : [];

  if (claims.length === 0) {
    return { ok: true, organizationId, skipped: false, claimed: 0, succeeded: 0, failed: 0 };
  }

  const prepared: PreparedAction[] = [];
  let failed = 0;

  for (const claim of claims) {
    try {
      prepared.push(await prepareAction(admin, organizationId, claim));
    } catch (error) {
      failed += 1;
      await finalizeClaim(
        admin,
        organizationId,
        claim,
        false,
        error instanceof Error ? error.message : 'document_prepare_failed',
      );
    }
  }

  if (prepared.length === 0) {
    return { ok: failed === 0, organizationId, skipped: false, claimed: claims.length, succeeded: 0, failed };
  }

  let response: Response;
  try {
    response = await openSearchFetch(config, opensearchUrl(config, '/_bulk'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-ndjson' },
      body: bulkBody(config, prepared),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'OpenSearch bulk request failed.';
    for (const action of prepared) {
      failed += 1;
      await finalizeClaim(admin, organizationId, action.claim, false, message);
    }
    return { ok: false, organizationId, skipped: false, claimed: claims.length, succeeded: 0, failed };
  }

  if (!response.ok) {
    const message = `OpenSearch bulk HTTP ${response.status}`;
    for (const action of prepared) {
      failed += 1;
      await finalizeClaim(admin, organizationId, action.claim, false, message);
    }
    return { ok: false, organizationId, skipped: false, claimed: claims.length, succeeded: 0, failed };
  }

  const payload = await response.json() as { items?: unknown[] };
  const items = Array.isArray(payload.items) ? payload.items : [];
  let succeeded = 0;

  for (let index = 0; index < prepared.length; index += 1) {
    const action = prepared[index];
    const item = items[index];
    const status = itemStatus(item);
    const success = action.operation === 'delete'
      ? (status >= 200 && status < 300) || status === 404
      : status >= 200 && status < 300;

    if (success) {
      succeeded += 1;
      await finalizeClaim(admin, organizationId, action.claim, true);
    } else {
      failed += 1;
      await finalizeClaim(admin, organizationId, action.claim, false, itemError(item));
    }
  }

  return {
    ok: failed === 0,
    organizationId,
    skipped: false,
    claimed: claims.length,
    succeeded,
    failed,
  };
}

export async function runSearchIndexWorker(filter?: { organizationId?: string }) {
  const admin = createAdminClient();
  let query = admin
    .from('search_index_settings')
    .select('organization_id')
    .eq('indexing_enabled', true);

  if (filter?.organizationId) {
    query = query.eq('organization_id', filter.organizationId);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Unable to resolve enabled search organizations: ${error.message}`);

  const results = [];
  for (const row of data || []) {
    const organizationId = String(row.organization_id);
    try {
      results.push(await runSearchIndexWorkerForOrganization(organizationId));
    } catch (error) {
      results.push({
        ok: false,
        organizationId,
        skipped: false,
        claimed: 0,
        succeeded: 0,
        failed: 0,
        error: error instanceof Error ? error.message : 'Unknown search worker error',
      });
    }
  }

  return {
    ok: results.every((result) => result.ok),
    organizations: results.length,
    results,
  };
}
