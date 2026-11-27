import 'server-only';
import {knowledgeImportObjectPath,KNOWLEDGE_IMPORT_BUCKET} from './knowledge-import-upload-contract';
import type {publishKnowledgeGatewayReview} from './knowledge-import-gateway-review';
type Publication=Parameters<typeof publishKnowledgeGatewayReview>[2];
type Scope=Parameters<Publication['reservation']>[0];
type Query=(statement:string,params:unknown[])=>Promise<{rows:Record<string,unknown>[]}>;
type ObjectScope={bucket:typeof KNOWLEDGE_IMPORT_BUCKET;path:string;byteLength:number};
type Provider={
 // A separate trusted provider must enforce create-only writes and immutable version reads.
 createOnly:(scope:ObjectScope,bytes:Uint8Array)=>Promise<void>;
 inspectExact:(scope:ObjectScope)=>Promise<{version:string;bytes:Uint8Array}>;
};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sha=/^[a-f0-9]{64}$/;
const reservationSql='select j.organization_id,j.id,j.requested_by,j.request_session_id,j.object_path,j.declared_bytes,j.upload_expires_at,j.status from knowledge_import_review.lock_job($1,$2) j';
/** Uses only scoped broker projections. No service-role key or bucket listing/delete.
 * The supplied provider is not itself a credential issuer. Never instantiate this in a live route
 * before separate provider permission and object-identity acceptance. */
export function createKnowledgePublicationAdapterReview(query:Query,provider:Provider,scope:Scope,now:()=>number=Date.now):Publication{
 const path=knowledgeImportObjectPath(scope.organizationId,scope.jobId);
 if(!path)throw Error('invalid publication scope');
 async function reservation(requested:Scope){
  if(requested.organizationId!==scope.organizationId||requested.jobId!==scope.jobId)throw Error('publication scope denied');
  const {rows}=await query(reservationSql,[scope.organizationId,scope.jobId]),row=rows[0];
  if(rows.length!==1||!row||row.organization_id!==scope.organizationId||row.id!==scope.jobId||row.object_path!==path||row.status!=='awaiting_upload'||
   typeof row.requested_by!=='string'||!uuid.test(row.requested_by)||typeof row.request_session_id!=='string'||!uuid.test(row.request_session_id))throw Error('reservation unavailable');
  const declaredBytes=Number(row.declared_bytes),expiresAtMs=row.upload_expires_at instanceof Date?row.upload_expires_at.getTime():NaN;
  if(!Number.isSafeInteger(declaredBytes)||declaredBytes<1||declaredBytes>52428800||!Number.isSafeInteger(expiresAtMs)||expiresAtMs<=now())throw Error('reservation unavailable');
  const context={organizationId:scope.organizationId,actorId:row.requested_by,sessionId:row.request_session_id,active:true,canManage:true};
  return {context,reservation:{...scope,actorId:context.actorId,sessionId:context.sessionId,objectPath:path!,declaredBytes,expiresAtMs}};
 }
 async function objectScope(requestedPath:string){
  if(requestedPath!==path)throw Error('publication path denied');
  const r=await reservation(scope);return {bucket:KNOWLEDGE_IMPORT_BUCKET,path:path!,byteLength:r.reservation.declaredBytes} as ObjectScope;
 }
 return {
  reservation,
  async put(requestedPath,bytes){
   const object=await objectScope(requestedPath);
   if(!(bytes instanceof Uint8Array)||bytes.byteLength!==object.byteLength)throw Error('invalid source bytes');
   await provider.createOnly(object,bytes);
  },
  async inspect(requestedPath){
   const object=await objectScope(requestedPath),result=await provider.inspectExact(object);
   if(!result||typeof result.version!=='string'||!result.version||result.version.length>256||!(result.bytes instanceof Uint8Array)||result.bytes.byteLength!==object.byteLength)throw Error('invalid provider response');
   return result;
  },
  async digests(payloads){
   const result=await query('select * from knowledge_import_review.digest_payloads($1::jsonb)',[JSON.stringify(payloads)]);
   if(result.rows.length!==payloads.length)throw Error('digest response rejected');
   return result.rows.map((row,i)=>{if(String(row.entry_index)!==String(i)||typeof row.payload_sha256!=='string'||!sha.test(row.payload_sha256))throw Error('digest response rejected');return row.payload_sha256;});
  },
  async register(){throw Error('fenced registration required');}
 };
}
