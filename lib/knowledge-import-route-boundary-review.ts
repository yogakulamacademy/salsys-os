import 'server-only';
import {createKnowledgeApplicationReview} from './knowledge-import-application-review';
type Options=Parameters<typeof createKnowledgeApplicationReview>[0];
type Handler=(request:Request)=>Promise<Response>;
const notFound=()=>new Response(JSON.stringify({error:'not_found'}),{status:404,headers:{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'}});
/** Production composition is deliberately disabled at source, not an environment flag.
 * Isolated test composition can supply trusted dependencies explicitly. */
export function createKnowledgeRouteBoundaryReview(config:{mode:'disabled'}|{mode:'isolated_fixture';options:Options}):Handler{
 if(config.mode==='disabled')return async()=>notFound();
 return createKnowledgeApplicationReview(config.options);
}
export const knowledgeImportDisabledRoute=createKnowledgeRouteBoundaryReview({mode:'disabled'});
