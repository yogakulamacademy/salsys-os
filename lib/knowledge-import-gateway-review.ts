import 'server-only';
import {createHash} from 'node:crypto';
import {prepareKnowledgeImportSource} from './knowledge-import-source-preparation';
import {knowledgeImportObjectPath, KNOWLEDGE_IMPORT_BUCKET} from './knowledge-import-upload-contract';

/** Review-only publication boundary. Not a browser route, chunk receiver, credential issuer or scheduler. */
export const KNOWLEDGE_IMPORT_GATEWAY_RUNTIME_WIRED=false as const;
type Scope=Readonly<{organizationId:string;jobId:string}>;
type Context=Parameters<typeof prepareKnowledgeImportSource>[0];
type Reservation=Parameters<typeof prepareKnowledgeImportSource>[1];
type Prepared=Extract<Awaited<ReturnType<typeof prepareKnowledgeImportSource>>,{ok:true}>;
type Adapters={
  // Server-owned verified current session; lock_job rechecks actual authority.
  reservation(scope:Scope):Promise<{context:Context;reservation:Reservation}>;
  // Exact server-authorized path, create-only, bounded transport. Never expose provider credentials.
  put(path:string,bytes:Uint8Array):Promise<void>;
  // Read actual object bytes and observed provider version, not caller-supplied metadata.
  inspect(path:string):Promise<{version:string;bytes:Uint8Array}>;
  digests:Parameters<typeof prepareKnowledgeImportSource>[4];
  // Recheck original authority, reservation state/expiry and register atomically.
  register(scope:Scope,prepared:Prepared):Promise<string>;
};
type Result={state:'registered';status:'queued'|'completed'}|{state:'rejected'}|{state:'reconciliation_required'};
const hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
/** Accepts a completed bounded source from a trusted gateway transport. An uncertain provider write
 * or registration never triggers automatic re-upload/delete. Private orphan objects require reconciliation.
 * Only database registration makes a source eligible for worker processing. */
export async function publishKnowledgeGatewayReview(scope:Scope,input:Uint8Array,a:Adapters,now:()=>number):Promise<Result>{
  let attemptedWrite=false;
  try{
    const path=knowledgeImportObjectPath(scope.organizationId,scope.jobId);
    if(!path||!(input instanceof Uint8Array)||input.byteLength<1||input.byteLength>50*1024*1024)return {state:'rejected'};
    const bytes=Uint8Array.from(input), digest=hash(bytes);
    const {context,reservation}=await a.reservation(scope);
    if(reservation.organizationId!==scope.organizationId||reservation.jobId!==scope.jobId||reservation.objectPath!==path||reservation.declaredBytes!==bytes.byteLength)return {state:'rejected'};
    // Validate content before any provider write; the provisional version is never registered.
    const source=(version:string,data:Uint8Array)=>({bucket:KNOWLEDGE_IMPORT_BUCKET,objectPath:path,version,contentType:'application/json',chunks:(async function*(){yield data;})()});
    const prepared=await prepareKnowledgeImportSource(context,reservation,{version:'prepublication',sha256:digest},source('prepublication',bytes),a.digests,now);
    if(!prepared.ok)return {state:'rejected'};
    // Fresh authority immediately before provider I/O. Revocation may still race the external write.
    const current=await a.reservation(scope);
    if(current.reservation.objectPath!==path||current.reservation.jobId!==scope.jobId||current.reservation.organizationId!==scope.organizationId||
       current.reservation.declaredBytes!==bytes.byteLength||current.context.actorId!==context.actorId||
       current.context.sessionId!==context.sessionId||current.context.organizationId!==scope.organizationId||
       current.context.active!==true||current.context.canManage!==true||now()>=current.reservation.expiresAtMs)return {state:'rejected'};
    attemptedWrite=true;
    await a.put(path,bytes);
    const observed=await a.inspect(path);
    if(!(observed.bytes instanceof Uint8Array)||observed.bytes.byteLength!==bytes.byteLength||hash(observed.bytes)!==digest||
      typeof observed.version!=='string'||!observed.version||observed.version.length>256)return {state:'reconciliation_required'};
    // The canonical manifest was generated from identical verified bytes before publication.
    const status=await a.register(scope,{...prepared,objectVersion:observed.version});
    return status==='queued'||status==='completed'?{state:'registered',status}:{state:'reconciliation_required'};
  }catch{return attemptedWrite?{state:'reconciliation_required'}:{state:'rejected'};}
}
