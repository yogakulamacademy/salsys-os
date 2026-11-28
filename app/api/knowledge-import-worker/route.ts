import { runKnowledgeImportWorker } from '@/lib/knowledge-import-worker-server';
import { bearerMatchesAnySecret } from '@/lib/security/machine-bearer-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;

function reply(status: number, value: Record<string, unknown>) {
  return Response.json(value, {
    status, headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
  });
}

async function isEmptyPost(request: Request): Promise<boolean> {
  if (new URL(request.url).search) return false;
  const length = request.headers.get('content-length');
  if ((length !== null && length !== '0') || request.headers.has('transfer-encoding')) return false;
  if (!request.body) return true;

  // Next's Node adapter can expose an empty POST as a stream.
  const reader = request.body.getReader();
  try {
    return (await reader.read()).done;
  } catch {
    return false;
  } finally {
    reader.releaseLock();
  }
}

export async function POST(request: Request) {
  if (process.env.KNOWLEDGE_IMPORT_ENABLED !== '1') return reply(404, { error: 'not_found' });

  const secret = process.env.KNOWLEDGE_IMPORT_WORKER_SECRET?.trim();
  if (!secret || secret.length < 32) return reply(503, { error: 'worker_unavailable' });
  if (!bearerMatchesAnySecret(request.headers.get('authorization'), [secret])) {
    return reply(401, { error: 'unauthorized' });
  }
  if (!(await isEmptyPost(request))) return reply(400, { error: 'invalid_request' });

  try {
    const result = await runKnowledgeImportWorker();
    if (result.stop === 'blocked' || result.stop === 'invalid_options') {
      return reply(503, { error: 'worker_blocked' });
    }
    return reply(200, { state: result.stop, jobs: result.reports.length });
  } catch {
    return reply(503, { error: 'worker_unavailable' });
  }
}
