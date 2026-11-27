import 'server-only';
import {projectKnowledgeImportHistory} from './knowledge-import-history-review';
export const KNOWLEDGE_HISTORY_HTTP_RUNTIME_WIRED=false as const;
type Query=(sql:string,params:unknown[])=>Promise<{rows:Record<string,unknown>[]}>;
type Options={origin:string;authenticate:(request:Request)=>Promise<{query:Query}|null>};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const cursor=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;
const json=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'}});
/** Unmounted history handler. Session-bound SQL derives tenant; no caller-supplied org. */
export function createKnowledgeHistoryHttpReview(options:Options){
 const origin=new URL(options.origin);
 if(origin.origin!==options.origin||!['http:','https:'].includes(origin.protocol)||(origin.protocol==='http:'&&!['localhost','127.0.0.1'].includes(origin.hostname)))throw Error('invalid origin');
 return async (request:Request)=>{
  if(request.method!=='GET')return json(405,{error:'method_not_allowed'});
  const u=new URL(request.url),site=request.headers.get('sec-fetch-site');
  if(u.origin!==origin.origin||(site!==null&&site!=='same-origin')||(request.headers.has('origin')&&request.headers.get('origin')!==origin.origin))return json(403,{error:'request_denied'});
  if([...u.searchParams.keys()].some(k=>!['before','beforeId'].includes(k))||u.searchParams.getAll('before').length>1||u.searchParams.getAll('beforeId').length>1)return json(400,{error:'invalid_cursor'});
  const before=u.searchParams.get('before'),id=u.searchParams.get('beforeId');
  if((before===null)!==(id===null)||(before!==null&&(!cursor.test(before)||!Number.isFinite(Date.parse(before))||!uuid.test(id!))))return json(400,{error:'invalid_cursor'});
  try{
   const auth=await options.authenticate(request);if(!auth)return json(403,{error:'request_denied'});
   const {rows}=await auth.query('select * from knowledge_import_review.current_history($1,$2,$3)',[25,before,id]);
   const jobs=projectKnowledgeImportHistory(rows);
   if(!jobs||jobs.some(j=>!cursor.test(j.createdAt)))return json(503,{error:'history_unavailable'});
   // Emit validated metadata only; preserve original timestamp precision for pagination.
   const last=jobs.length===25?jobs[jobs.length-1]:null;
   return json(200,{jobs,nextCursor:last?{before:last.createdAt,beforeId:last.id}:null});
  }catch{return json(503,{error:'history_unavailable'});}
 };
}
