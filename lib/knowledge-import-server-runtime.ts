import 'server-only';
import { createKnowledgePostgresConnector } from './knowledge-import-postgres';
import { createKnowledgeCookieRuntimeReview } from './knowledge-import-server-auth-review';
import { getKnowledgeImportStorage } from './knowledge-import-storage-runtime';

export async function resolveKnowledgeImportPageScope(organizationId: string): Promise<string | null> {
  try {
    return await getKnowledgeImportServerRuntime()?.resolveScope(organizationId) ?? null;
  } catch {
    return null;
  }
}

export function getKnowledgeImportServerRuntime() {
  if (process.env.KNOWLEDGE_IMPORT_ENABLED !== '1') return null;
  const origin = process.env.KNOWLEDGE_IMPORT_ORIGIN;
  const connectionUrl = process.env.KNOWLEDGE_IMPORT_DATABASE_URL;
  const login = process.env.KNOWLEDGE_IMPORT_DATABASE_LOGIN;
  if (!origin || !connectionUrl || !login) {
    throw new Error('Knowledge import configuration is incomplete');
  }

  const app = new URL(origin);
  if (app.protocol !== 'https:' || app.origin !== origin) {
    throw new Error('Invalid knowledge import origins');
  }
  const { provider, projectRef, storage } = getKnowledgeImportStorage(
    process.env.KNOWLEDGE_IMPORT_STORAGE_TOKEN, 'knowledge_import_gateway_storage',
  );
  return createKnowledgeCookieRuntimeReview({
    origin,
    issuer: provider.origin + '/auth/v1',
    uploadSeconds: 900,
    retentionSeconds: 86400,
    openDedicatedApplication: createKnowledgePostgresConnector({
      mode: 'hosted', connectionUrl, login, projectRef, ca: process.env.KNOWLEDGE_IMPORT_DATABASE_CA,
    }),
    providerFor: () => ({
      async createOnly({ bucket, path }, bytes) {
        const body = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const result = await storage.from(bucket).upload(path, body, {
          upsert: false, contentType: 'application/json', cacheControl: '0',
        });
        if (result.error) throw new Error('Knowledge source publication failed');
      },
      async inspectExact({ bucket, path, byteLength }) {
        const files = storage.from(bucket);
        const info = await files.info(path);
        const version = info.data?.version;
        if (info.error || typeof version !== 'string' || !version) {
          throw new Error('Knowledge source version unavailable');
        }
        const signed = await files.createSignedUrl(path, 30, { versionId: version });
        if (signed.error || !signed.data?.signedUrl) throw new Error('Knowledge source signing failed');
        const readUrl = new URL(signed.data.signedUrl);
        if (readUrl.origin !== provider.origin || readUrl.username || readUrl.password || readUrl.hash ||
            readUrl.pathname !== '/storage/v1/object/sign/' + bucket + '/' + path ||
            !readUrl.searchParams.get('token') || [...readUrl.searchParams.keys()].length !== 1) {
          throw new Error('Invalid knowledge source URL');
        }
        const response = await fetch(readUrl, {
          redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(30000),
        });
        if (response.status !== 200 || !response.body ||
            response.headers.get('content-type')?.split(';')[0] !== 'application/json' ||
            (response.headers.has('content-length') && response.headers.get('content-length') !== String(byteLength))) {
          await response.body?.cancel().catch(() => {});
          throw new Error('Knowledge source read failed');
        }
        const body = response.body;
        const chunks = (async function* () {
          const reader = body.getReader();
          try {
            for (;;) {
              const chunk = await reader.read();
              if (chunk.done) return;
              yield chunk.value;
            }
          } finally {
            await reader.cancel().catch(() => {});
            reader.releaseLock();
          }
        })();
        return { version, chunks };
      },
    }),
  });
}
