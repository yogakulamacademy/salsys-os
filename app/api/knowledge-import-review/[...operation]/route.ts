import {knowledgeImportDisabledRoute} from '@/lib/knowledge-import-route-boundary-review';
export const runtime='nodejs';
export const dynamic='force-dynamic';
// Intentionally hard-disabled. No credential loading, auth calls or DB access in this build.
export async function GET(request:Request){return knowledgeImportDisabledRoute(request);}
export async function POST(request:Request){return knowledgeImportDisabledRoute(request);}
