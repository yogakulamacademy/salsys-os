import 'server-only';
import { prepareKnowledgeWorkerSource } from './knowledge-import-source-preparation';
import { knowledgeImportObjectPath, KNOWLEDGE_IMPORT_BUCKET } from './knowledge-import-upload-contract';
import type { runKnowledgeImportBatchReview } from './knowledge-import-worker-review';

/** Unwired, server-only transport adapter. No credentials, grants, or scheduler are created here. */
export const KNOWLEDGE_IMPORT_ADAPTER_RUNTIME_WIRED = false as const;
type Scope=Parameters<typeof runKnowledgeImportBatchReview>[0];
type Adapters=Parameters<typeof runKnowledgeImportBatchReview>[1];
type Identity=Awaited<ReturnType<Adapters['readIdentity']>>;
type Query=(sql:string,params:unknown[])=>Promise<{rows:Record<string,unknown>[]}>;
type IssueReadUrl=(scope:Scope,identity:Identity)=>Promise<string>;
type Fetcher=typeof fetch;
const sha=/^[a-f0-9]{64}$/;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function one(rows:Record<string,unknown>[]){if(rows.length!==1)throw Error('invalid worker response');return rows[0];}
function requireUuid(v:unknown){if(typeof v!=='string'||!uuid.test(v))throw Error('invalid worker response');return v;}
/** Only an independently authorized broker may issue the signed URL. Never log or return it to UI.
 * Digest verification establishes content equality, not provider object-version immutability. */
export async function readSignedKnowledgeSource(scope:Scope,identity:Identity,projectOrigin:string,issue:IssueReadUrl,fetcher:Fetcher=fetch){
  const origin=new URL(projectOrigin), path=knowledgeImportObjectPath(scope.organizationId,scope.jobId);
  if(origin.protocol!=='https:'||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash||
    !/^[a-z0-9]+\.supabase\.co$/.test(origin.hostname)||origin.port||!path||identity.objectPath!==path||
    !Number.isSafeInteger(identity.byteLength)||identity.byteLength<1||identity.byteLength>50*1024*1024||
    !sha.test(identity.sha256)||!identity.objectVersion||identity.objectVersion.length>256)throw Error('source identity rejected');
  const url=new URL(await issue(scope,identity));
  if(url.origin!==origin.origin||url.username||url.password||url.hash||
    url.pathname!=='/storage/v1/object/sign/'+KNOWLEDGE_IMPORT_BUCKET+'/'+path||
    url.searchParams.getAll('token').length!==1||!url.searchParams.get('token')||
    [...url.searchParams.keys()].some(k=>k!=='token'))throw Error('read URL rejected');
  const response=await fetcher(url,{method:'GET',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(60_000)});
  const mime=response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  const length=response.headers.get('content-length');
  if(response.status!==200||!response.body||mime!=='application/json'||
    (length!==null&&(!/^\d+$/.test(length)||Number(length)!==identity.byteLength))){
    await response.body?.cancel().catch(()=>{});throw Error('source response rejected');
  }
  const body=response.body;
  const chunks=(async function*(){const reader=body.getReader();try{while(true){const x=await reader.read();if(x.done)break;yield x.value;}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}})();
  return {bucket:KNOWLEDGE_IMPORT_BUCKET,objectPath:path,version:identity.objectVersion,contentType:'application/json',chunks};
}
/** Query must run each parameterized statement on a dedicated worker login in autocommit.
 * No shared service-role connection or SET ROLE/JWT. All finalize transport errors remain uncertain.
 * A later transaction-aware adapter may classify a confirmed rollback. */
export function createKnowledgeWorkerReviewAdapters(query:Query,projectOrigin:string,issueReadUrl:IssueReadUrl,fetcher:Fetcher=fetch):Adapters{
  return createKnowledgeWorkerSourceAdaptersReview(query,(scope,identity)=>readSignedKnowledgeSource(scope,identity,projectOrigin,issueReadUrl,fetcher));
}
/** A trusted source reader must independently authorize and pin the exact object, enforce bounded
 * reads, and return bytes for the existing hash/manifest verification. This seam is also used
 * by disposable provider tests without weakening the production signed URL origin checks. */
export function createKnowledgeWorkerSourceAdaptersReview(query:Query,readSource:(scope:Scope,identity:Identity)=>Promise<Parameters<typeof prepareKnowledgeWorkerSource>[2]>):Adapters{
  const args=(scope:Scope)=>[scope.organizationId,scope.jobId];
  const digest=async(scope:Scope,payloads:readonly unknown[]):Promise<string[]>=>{
    // Split bounded canonical batches conservatively; database checks its own byte limit.
    const out:string[]=[];
    for(let i=0;i<payloads.length;i+=10){
      const part=payloads.slice(i,i+10);
      const {rows}=await query('select * from knowledge_import_review.worker_digest_payloads($1,$2,$3::jsonb)',[...args(scope),JSON.stringify(part)]);
      if(rows.length!==part.length)throw Error('digest response rejected');
      rows.forEach((row,j)=>{if(String(row.entry_index)!==String(j)||typeof row.payload_sha256!=='string'||!sha.test(row.payload_sha256))throw Error('digest response rejected');out.push(row.payload_sha256);});
    }return out;
  };
  return {
    async readIdentity(scope){const row=one((await query('select * from knowledge_import_review.worker_source_identity($1,$2)',args(scope))).rows);
      if(typeof row.object_path!=='string'||typeof row.object_version!=='string'||typeof row.source_sha256!=='string'||typeof row.manifest_sha256!=='string')throw Error('invalid identity');
      const byteLength=Number(row.byte_length);if(!Number.isSafeInteger(byteLength))throw Error('invalid identity');
      return {objectPath:row.object_path,objectVersion:row.object_version,byteLength,sha256:row.source_sha256,manifestSha256:row.manifest_sha256};
    },
    async prepareVerifiedSource(scope,identity){const source=await readSource(scope,identity);
      const p=await prepareKnowledgeWorkerSource(scope,identity,source,rows=>digest(scope,rows));return p.ok?p:null;},
    async verifyManifest(scope,p){return one((await query('select knowledge_import_review.worker_verify_manifest($1,$2,$3,$4,$5,$6::jsonb) as ok',[...args(scope),p.objectVersion,p.byteLength,p.sha256,JSON.stringify(p.manifest)])).rows).ok===true;},
    async claim(scope,limit){return (await query('select * from knowledge_import_review.worker_claim($1,$2,$3)',[...args(scope),limit])).rows.map(row=>{
      if(typeof row.entry_index!=='number'||typeof row.attempts!=='number')throw Error('invalid claim');return {entry_index:row.entry_index,attempts:row.attempts,lease_token:requireUuid(row.lease_token)};});},
    async finalize(scope,c,payload){try{const row=one((await query('select knowledge_import_review.worker_finalize($1,$2,$3,$4,$5,$6::jsonb) as id',[...args(scope),c.entry_index,c.lease_token,c.attempts,JSON.stringify(payload)])).rows);
      return {kind:'committed',documentId:requireUuid(row.id)};}catch{return {kind:'unknown'};}},
    async result(scope,c){const row=one((await query('select knowledge_import_review.worker_result($1,$2,$3,$4,$5) as id',[...args(scope),c.entry_index,c.lease_token,c.attempts])).rows);return row.id===null?null:requireUuid(row.id);},
    async settleFailure(scope,c,code){const row=one((await query('select knowledge_import_review.worker_settle_failure($1,$2,$3,$4,$5,$6) as status',[...args(scope),c.entry_index,c.lease_token,c.attempts,code])).rows);if(row.status!=='pending'&&row.status!=='failed')throw Error('invalid settlement');return row.status;}
  };
}
