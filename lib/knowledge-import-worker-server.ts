import 'server-only';

import { createKnowledgePostgresConnector } from './knowledge-import-postgres';
import { getKnowledgeImportStorage } from './knowledge-import-storage-runtime';
import { runKnowledgeVersionedWorkerRuntimeReview } from './knowledge-import-worker-runtime-review';

export async function runKnowledgeImportWorker() {
  const connectionUrl = process.env.KNOWLEDGE_IMPORT_WORKER_DATABASE_URL;
  const login = process.env.KNOWLEDGE_IMPORT_WORKER_DATABASE_LOGIN;
  if (!connectionUrl || !login) throw new Error('Knowledge import worker configuration is incomplete');

  const { provider, projectRef, storage } = getKnowledgeImportStorage(
    process.env.KNOWLEDGE_IMPORT_WORKER_STORAGE_TOKEN, 'knowledge_import_worker_storage',
  );
  const connect = createKnowledgePostgresConnector({
    mode: 'hosted', connectionUrl, login, projectRef, ca: process.env.KNOWLEDGE_IMPORT_DATABASE_CA,
  });
  return runKnowledgeVersionedWorkerRuntimeReview({
    expectedLogin: login,
    openDedicatedWorker: connect,
    projectOrigin: provider.origin,
    issuer: { openIssuerConnection: connect, storage },
  });
}
