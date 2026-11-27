import 'server-only';
import {createKnowledgeGatewayHttpReview} from './knowledge-import-gateway-http-review';
import {createKnowledgeHistoryHttpReview} from './knowledge-import-history-http-review';
export const KNOWLEDGE_APPLICATION_RUNTIME_WIRED=false as const;
type AuthOptions=Parameters<typeof createKnowledgeGatewayHttpReview>[0];
type Authenticated=NonNullable<Awaited<ReturnType<AuthOptions['authenticate']>>>;
type Query=Authenticated['query'];
type Claims={sub:string;session_id:string;role:'authenticated';is_anonymous:false;exp:number};
type Options={origin:string;issuer:string;accessToken:(request:Request)=>Promise<string|null>;
 // Must verify this exact token with trusted Auth (not merely decode or getSession).
 verifyUser:(token:string)=>Promise<{id:string;is_anonymous?:boolean}|null>;
 // Trusted broker must bind claims per statement/transaction; never reuse mutable pooled claims.
 connect:(claims:Claims)=>Promise<{query:Query;publicationFor:(scope:{organizationId:string;jobId:string})=>Authenticated['publication'];close:()=>Promise<void>}>;
 uploadSeconds:number;retentionSeconds:number;now?:()=>number};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json=(status:number,value:unknown)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'}});
function readClaims(token:string,issuer:string,actor:string,now:number):Claims|null{
 try{
  if(token.length>16384)return null;const parts=token.split('.');if(parts.length!==3||parts.some(x=>!x))return null;
  const c=JSON.parse(Buffer.from(parts[1],'base64url').toString('utf8'));
  if(c.iss!==issuer||c.sub!==actor||!uuid.test(c.sub)||typeof c.session_id!=='string'||!uuid.test(c.session_id)||c.role!=='authenticated'||c.is_anonymous===true||!Number.isSafeInteger(c.exp)||c.exp<=Math.floor(now/1000))return null;
  return {sub:c.sub,session_id:c.session_id,role:'authenticated',is_anonymous:false,exp:c.exp};
 }catch{return null;}
}
/** Single dispatch boundary for isolated integration. No live route or credentials.
 * Only same-origin requests, verified token, and current database-bound tenant.
 * Connector is a trusted broker, NOT a general SQL endpoint. */
export function createKnowledgeApplicationReview(o:Options){
 const origin=new URL(o.origin);
 if(origin.origin!==o.origin||!['http:','https:'].includes(origin.protocol)||(origin.protocol==='http:'&&!['127.0.0.1','localhost'].includes(origin.hostname)))throw Error('invalid origin');
 if(!Number.isInteger(o.uploadSeconds)||o.uploadSeconds<60||o.uploadSeconds>86400||!Number.isInteger(o.retentionSeconds)||o.retentionSeconds<o.uploadSeconds||o.retentionSeconds>2592000)throw Error('unapproved policy');
 return async(request:Request):Promise<Response>=>{
  const u=new URL(request.url),site=request.headers.get('sec-fetch-site'),isGet=request.method==='GET';
  if(u.origin!==o.origin||(site!==null&&site!=='same-origin')||(!isGet&&request.headers.get('origin')!==o.origin)||(isGet&&request.headers.has('origin')&&request.headers.get('origin')!==o.origin))return json(403,{error:'request_denied'});
  const prefix='/api/knowledge-import-review/';
  if(!u.pathname.startsWith(prefix))return json(404,{error:'not_found'});
  const parts=u.pathname.slice(prefix.length).split('/'),history=parts.length===1&&parts[0]==='history';
  const job=parts[0],op=parts[1];
  if(!history&&(parts.length!==2||!uuid.test(job)||!['reserve','cancel','acquire','append','publish','receipt'].includes(op)||u.search))return json(404,{error:'not_found'});
  if((history&&!isGet)||(!history&&request.method!=='POST'))return json(405,{error:'method_not_allowed'});
  let conn:Awaited<ReturnType<Options['connect']>>|undefined;
  try{
   const token=await o.accessToken(request);if(!token||token.length>16384)return json(403,{error:'request_denied'});
   const user=await o.verifyUser(token);if(!user||user.is_anonymous===true)return json(403,{error:'request_denied'});
   const claims=readClaims(token,o.issuer,user.id,(o.now??Date.now)());if(!claims)return json(403,{error:'request_denied'});
   conn=await o.connect(claims);
   const {rows}=await conn.query('select knowledge_import_review.current_scope() as organization_id',[]);
   if(rows.length!==1||typeof rows[0].organization_id!=='string'||!uuid.test(rows[0].organization_id))return json(403,{error:'request_denied'});
   const context={organizationId:rows[0].organization_id,query:conn.query};
   if(history)return await createKnowledgeHistoryHttpReview({origin:o.origin,authenticate:async()=>context})(request);
   if(op==='reserve'||op==='cancel'){
    if(request.body!==null||(request.headers.get('content-length')??'0')!=='0')return json(400,{error:'unexpected_body'});
    if(op==='reserve'){
     const raw=request.headers.get('x-knowledge-file-bytes');
     if(!raw||!/^[1-9][0-9]{0,7}$/.test(raw)||Number(raw)>52428800)return json(400,{error:'invalid_file_size'});
     const result=await conn.query('select knowledge_import_review.reserve_current($1,$2,$3,$4) as id',[job,Number(raw),o.uploadSeconds,o.retentionSeconds]);
     if(result.rows.length!==1||result.rows[0].id!==job)return json(409,{error:'reservation_not_confirmed'});
     return json(200,{jobId:job,status:'awaiting_upload'});
    }
    const result=await conn.query('select knowledge_import_review.cancel_current($1) as ok',[job]);
    return result.rows.length===1&&result.rows[0].ok===true?json(200,{status:'cancelled'}):json(409,{error:'cancellation_not_confirmed'});
   }
   // Publication dependencies are derived from the verified DB tenant and this job,
   // not from a client tenant header or a shared adapter from another request.
   const scoped=conn.publicationFor({organizationId:context.organizationId,jobId:job});
   return await createKnowledgeGatewayHttpReview({origin:o.origin,authenticate:async()=>({...context,publication:scoped}),now:o.now})(request,job,op as 'acquire'|'append'|'publish'|'receipt');
  }catch{return json(403,{error:'request_denied'});}
  finally{try{await conn?.close();}catch{/* broker must discard failed connection */}}
 };
}
