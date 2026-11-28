import 'server-only';

import { createClient } from '@supabase/supabase-js';
import { getSupabasePublicConfig } from '@/lib/config';

type StorageRole = 'knowledge_import_gateway_storage' | 'knowledge_import_worker_storage';

export function getKnowledgeImportStorage(token: string | undefined, role: StorageRole) {
  const { url, key, configured } = getSupabasePublicConfig();
  if (!configured || !url || !key || !token) throw new Error('Knowledge import Storage configuration is incomplete');

  const provider = new URL(url);
  if (provider.protocol !== 'https:' || !/^[a-z0-9]{20}\.supabase\.co$/.test(provider.hostname) ||
      provider.href !== provider.origin + '/') {
    throw new Error('Invalid knowledge import Storage origin');
  }

  const parts = token.split('.');
  if (parts.length !== 3 || parts.some((part) => !part)) throw new Error('Invalid knowledge import Storage credential');
  const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
  if (claims?.role !== role || !Number.isSafeInteger(claims.exp) || claims.exp <= Math.floor(Date.now() / 1000)) {
    throw new Error('Invalid knowledge import Storage credential');
  }

  return {
    provider,
    projectRef: provider.hostname.split('.')[0],
    storage: createClient(provider.origin, key, {
      accessToken: async () => token,
      global: {
        fetch: (input, init) => fetch(input, {
          ...init, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(30000),
        }),
      },
    }).storage,
  };
}
