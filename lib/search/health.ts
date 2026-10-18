import 'server-only';

import { ensureOpenSearchIndex, getOpenSearchConfig, openSearchFetch } from '@/lib/search/opensearch';

type ClusterInfo = {
  name?: string;
  cluster_name?: string;
  version?: {
    number?: string;
    distribution?: string;
  };
};

function timeoutSignal(ms = 8000) {
  return AbortSignal.timeout(ms);
}

function safePrefix(raw: string | undefined) {
  const value = (raw || 'salsys').trim();
  if (!/^[a-z0-9][a-z0-9_-]{0,119}$/i.test(value)) {
    throw new Error('OPENSEARCH_INDEX_PREFIX contains unsupported characters.');
  }
  return value.toLowerCase();
}

export async function getOpenSearchHealth() {
  const rawPrefix = process.env.OPENSEARCH_INDEX_PREFIX;
  safePrefix(rawPrefix);

  const config = getOpenSearchConfig();
  const startedAt = Date.now();

  let clusterResponse: Response;
  try {
    clusterResponse = await openSearchFetch(config, config.endpoint, {
      method: 'GET',
      signal: timeoutSignal(),
    });
  } catch {
    return {
      ok: false,
      reachable: false,
      authenticated: false,
      indexExists: false,
      mappingSafe: false,
      indexName: config.indexName,
      latencyMs: Date.now() - startedAt,
      reason: 'cluster_unreachable',
    };
  }

  const serverlessRootNotFound = config.awsService === 'aoss' && clusterResponse.status === 404;

  if (!clusterResponse.ok && !serverlessRootNotFound) {
    return {
      ok: false,
      reachable: true,
      authenticated: ![401, 403].includes(clusterResponse.status),
      indexExists: false,
      mappingSafe: false,
      indexName: config.indexName,
      latencyMs: Date.now() - startedAt,
      reason: [401, 403].includes(clusterResponse.status)
        ? 'authentication_failed'
        : `cluster_http_${clusterResponse.status}`,
    };
  }

  let info: ClusterInfo = {};
  if (clusterResponse.ok) {
    try {
      info = (await clusterResponse.json()) as ClusterInfo;
    } catch {
      info = {};
    }
  }

  const indexUrl = `${config.endpoint}/${encodeURIComponent(config.indexName)}`;
  const indexResponse = await openSearchFetch(config, indexUrl, {
    method: 'HEAD',
    signal: timeoutSignal(),
  });

  const indexExists = indexResponse.ok;
  let mappingSafe = false;

  if (indexExists) {
    const mappingResponse = await openSearchFetch(config, `${indexUrl}/_mapping`, {
      method: 'GET',
      signal: timeoutSignal(),
    });

    if (mappingResponse.ok) {
      const mapping = (await mappingResponse.json()) as Record<string, unknown>;
      const root = mapping[config.indexName];
      if (root && typeof root === 'object' && !Array.isArray(root)) {
        const mappings = (root as Record<string, unknown>).mappings;
        if (mappings && typeof mappings === 'object' && !Array.isArray(mappings)) {
          const value = mappings as Record<string, unknown>;
          const properties = value.properties;
          mappingSafe = value.dynamic === false
            && Boolean(properties && typeof properties === 'object' && !Array.isArray(properties)
              && 'organization_id' in (properties as Record<string, unknown>)
              && 'entity_type' in (properties as Record<string, unknown>)
              && 'entity_id' in (properties as Record<string, unknown>));
        }
      }
    }
  }

  return {
    ok: indexExists && mappingSafe,
    reachable: true,
    authenticated: true,
    indexExists,
    mappingSafe,
    indexName: config.indexName,
    latencyMs: Date.now() - startedAt,
    cluster: {
      name: info.name || null,
      distribution: info.version?.distribution || null,
      version: info.version?.number || null,
    },
    reason: !indexExists ? 'index_missing' : !mappingSafe ? 'mapping_not_safe' : null,
  };
}

export async function bootstrapOpenSearchIndex() {
  safePrefix(process.env.OPENSEARCH_INDEX_PREFIX);
  const config = getOpenSearchConfig();

  const before = await getOpenSearchHealth();
  if (!before.reachable || !before.authenticated) {
    return { ok: false, created: false, health: before };
  }

  if (before.indexExists && !before.mappingSafe) {
    return {
      ok: false,
      created: false,
      reason: 'existing_index_mapping_not_safe',
      health: before,
    };
  }

  await ensureOpenSearchIndex(config);
  const after = await getOpenSearchHealth();

  return {
    ok: after.ok,
    created: !before.indexExists && after.indexExists,
    health: after,
  };
}
