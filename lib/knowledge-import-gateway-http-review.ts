import 'server-only';
import {randomUUID} from 'node:crypto';
import {publishKnowledgeGatewayReview} from './knowledge-import-gateway-review';

export const KNOWLEDGE_IMPORT_HTTP_RUNTIME_WIRED=false as const;
const CHUNK=1048576, MAX=50*CHUNK;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Scope={organizationId:string;jobId:string};
type Query=(sql:string,params:unknown[])=>Promise<{rows:Record<string,unknown>[]}>;
type Publication=Parameters<typeof publishKnowledgeGatewayReview>[2];
// A trusted server adapter must verify real Auth credentials, session binding, current admin role,
// and supply a dedicated scoped autocommit query context. Never trust an HTTP tenant/actor header.
type Authenticated={organizationId:string;query:Query;publication:Publication};
type Options={origin:string;authenticate:(request:Request)=>Promise<Authenticated|null>;now?:()=>number};
type Operation='acquire'|'append'|'publish';
function json(status:number,body:Record<string,unknown>){return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'}});}
function integer(s:unknown,min:number,max:number){if(typeof s!=='string'||!/^(0|[1-9][0-9]*)$/.test(s))return null;const n=Number(s);return Number.isSafeInteger(n)&&n>=min&&n<=max?n:null;}
function one(rows:Record<string,unknown>[]){if(rows.length!==1)throw Error('unexpected response');return rows[0];}
async function boundedBody(request:Request,n:number){
 if(!request.body)throw Error('missing body');
 const reader=request.body.getReader(),out=new Uint8Array(n);let offset=0;
 try{while(true){const r=await reader.read();if(r.done)break;if(offset+r.value.byteLength>n)throw Error('oversize body');out.set(r.value,offset);offset+=r.value.byteLength;}
 if(offset!==n)throw Error('length mismatch');return out;}
 finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
/** Unmounted handler factory. No network listener, grants or live route.
 * Publish request contains no file bytes; source is assembled by the fenced database stage.
 * Unknown outcomes fail closed; no automatic provider write retry. */
export function createKnowledgeGatewayHttpReview(options:Options){
 const origin=new URL(options.origin);
 if(origin.origin!==options.origin||!['https:','http:'].includes(origin.protocol)||(origin.protocol==='http:'&&!['localhost','127.0.0.1'].includes(origin.hostname)))throw Error('invalid gateway origin');
 return async function handle(request:Request,jobId:string,operation:Operation):Promise<Response>{
  if(request.method!=='POST'||!['acquire','append','publish'].includes(operation))return json(405,{error:'method_not_allowed'});
  if(request.headers.get('origin')!==origin.origin||!uuid.test(jobId))return json(403,{error:'request_denied'});
  let auth:Authenticated|null;
  try{auth=await options.authenticate(request);}catch{return json(403,{error:'request_denied'});}
  if(!auth||!uuid.test(auth.organizationId))return json(403,{error:'request_denied'});
  const scope:Scope={organizationId:auth.organizationId,jobId},args=[scope.organizationId,scope.jobId],query=auth.query;
  const length=integer(request.headers.get('content-length'),0,CHUNK),encoding=request.headers.get('content-encoding');
  if(length===null||(encoding!==null&&encoding!=='identity'))return json(413,{error:'invalid_body'});
  if(operation!=='append'&&(length!==0||request.body!==null))return json(400,{error:'unexpected_body'});
  const supplied=request.headers.get('x-knowledge-writer');
  if(operation==='acquire'){
   if(supplied!==null&&!uuid.test(supplied))return json(400,{error:'invalid_writer'});
   const token=supplied??randomUUID();
   try{const row=one((await query('select * from knowledge_import_review.gateway_acquire($1,$2,$3)',[...args,token])).rows);
    const generation=integer(String(row.generation),1,Number.MAX_SAFE_INTEGER),received=integer(String(row.received_bytes),0,MAX);
    if(generation===null||received===null)throw Error('invalid writer receipt');
    return json(200,{writer:token,generation,receivedBytes:received});
   }catch{return json(409,{error:'writer_unavailable'});}
  }
  const generation=integer(request.headers.get('x-knowledge-generation'),1,Number.MAX_SAFE_INTEGER);
  if(!supplied||!uuid.test(supplied)||generation===null)return json(400,{error:'invalid_writer'});
  const fence=[...args,supplied,generation];
  if(operation==='append'){
   const offset=integer(request.headers.get('x-knowledge-offset'),0,MAX-1);
   if(length<1||offset===null||offset%CHUNK!==0||offset+length>MAX||request.headers.get('content-type')!=='application/octet-stream')return json(400,{error:'invalid_chunk'});
   let bytes:Uint8Array;
   try{bytes=await boundedBody(request,length);}catch{return json(400,{error:'invalid_body'});}
   try{const row=one((await query('select knowledge_import_review.gateway_append($1,$2,$3,$4,$5,$6) as n',[...fence,offset,Buffer.from(bytes)])).rows);
    const received=integer(String(row.n),offset+length,MAX);if(received===null)throw Error('invalid receipt');
    return json(200,{receivedBytes:received});
   }catch{return json(409,{error:'chunk_not_confirmed'});}
  }
  // Once begin_publication is attempted, even a lost response requires reconciliation.
  try{
   const row=one((await query('select knowledge_import_review.gateway_begin_publication($1,$2,$3,$4) as bytes',fence)).rows);
   if(!(row.bytes instanceof Uint8Array)||row.bytes.byteLength<1||row.bytes.byteLength>MAX)throw Error('invalid staged source');
   const p=auth.publication;
   const result=await publishKnowledgeGatewayReview(scope,row.bytes,{
    ...p,
    async put(path,bytes){
     await query("select knowledge_import_review.gateway_lock($1,$2,$3,$4,'publishing')",fence);
     await p.put(path,bytes);
    },
    async register(_scope,prepared){
     const r=one((await query('select knowledge_import_review.gateway_register($1,$2,$3,$4,$5,$6,$7,$8::jsonb) as status',[...fence,prepared.objectVersion,prepared.byteLength,prepared.sha256,JSON.stringify(prepared.manifest)])).rows);
     return String(r.status);
    }
   },options.now??Date.now);
   return result.state==='registered'?json(200,result):json(409,{state:'reconciliation_required'});
  }catch{return json(409,{state:'reconciliation_required'});}
 };
}
