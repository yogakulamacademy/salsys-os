import { knowledgeImportDisabledRoute } from '@/lib/knowledge-import-route-boundary-review';
import { getKnowledgeImportServerRuntime } from '@/lib/knowledge-import-server-runtime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function handle(request: Request) {
  try {
    const app = getKnowledgeImportServerRuntime();
    if (app) return await app.handle(request);
  } catch {
    return Response.json({ error: 'import_unavailable' }, {
      status: 503,
      headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
    });
  }
  return knowledgeImportDisabledRoute(request);
}

export async function GET(request: Request) { return handle(request); }
export async function POST(request: Request) { return handle(request); }
