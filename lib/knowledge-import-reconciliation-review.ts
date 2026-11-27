import 'server-only';
import {createHash} from 'node:crypto';
import {knowledgeImportObjectPath,KNOWLEDGE_IMPORT_BUCKET} from './knowledge-import-upload-contract';
export const KNOWLEDGE_RECONCILIATION_RUNTIME_WIRED=false as const;
type Scope={organizationId:string;jobId:string};
type Snapshot={object_path:string;job_status:string;phase:string|null;expected_bytes:unknown;expected_sha:string|null;registered_version:string|null;staged_bytes:unknown};
type Observation={kind:'absent_observed'}|{kind:'present';version:string;chunks:AsyncIterable<Uint8Array>}|{kind:'unknown'};
type State='not_eligible'|'absent_unproven'|'matching_registered'|'matching_orphan'|'identity_conflict'|'uncertain';
type Result={state:State;observedVersion?:string;mayDelete:false;mayReleaseQuota:false};
const sha=/^[a-f0-9]{64}$/;
const result=(state:State,observedVersion?:string):Result=>({state,...(observedVersion?{observedVersion}:{}),mayDelete:false,mayReleaseQuota:false});
/** Privileged operator inspection ONLY. Adapter must provide independently authorized, bounded
 * observations. Absence of current object does not prove no old versions, in-flight writes or
 * retained physical data. Never re-register, delete, purge staging, or release quota here. */
export async function inspectKnowledgeStorageReconciliationReview(scope:Scope,a:{
 snapshot:(scope:Scope)=>Promise<Snapshot|null>;
 observe:(bucket:string,path:string)=>Promise<Observation>;
}):Promise<Result>{
 const path=knowledgeImportObjectPath(scope.organizationId,scope.jobId);if(!path)return result('not_eligible');
 try{
  const s=await a.snapshot(scope);if(!s||s.object_path!==path||!['completed','failed','cancelled','expired'].includes(s.job_status))return result('not_eligible');
  const n=Number(s.expected_bytes),staged=Number(s.staged_bytes);
  if(!Number.isSafeInteger(n)||n<1||n>52428800||!Number.isSafeInteger(staged)||staged<0||staged>n||
    ![null,'receiving','publishing','registered'].includes(s.phase)||
    (s.expected_sha!==null&&!sha.test(s.expected_sha))||
    (s.registered_version!==null&&(!s.registered_version||s.registered_version.length>256)))return result('uncertain');
  const o=await a.observe(KNOWLEDGE_IMPORT_BUCKET,path);
  let candidate:Result;
  if(o.kind==='absent_observed')candidate=result('absent_unproven');
  else if(o.kind==='present'){
   if(!o.version||o.version.length>256||!s.expected_sha)return result('identity_conflict');
   let length=0;const hash=createHash('sha256');
   for await(const chunk of o.chunks){if(!(chunk instanceof Uint8Array))return result('uncertain');length+=chunk.byteLength;if(length>n)return result('identity_conflict');hash.update(chunk);}
   if(length!==n||hash.digest('hex')!==s.expected_sha||(s.registered_version!==null&&s.registered_version!==o.version))candidate=result('identity_conflict');
   else if(s.phase==='registered'&&s.registered_version===o.version)candidate=result('matching_registered',o.version);
   else if(s.phase==='publishing'&&s.registered_version===null)candidate=result('matching_orphan',o.version);
   else candidate=result('uncertain');
  }else candidate=result('uncertain');
  // Detect ledger changes across the external read. This is not a provider-side write fence.
  const after=await a.snapshot(scope);
  if(!after||JSON.stringify(after)!==JSON.stringify(s))return result('uncertain');
  return candidate;
 }catch{return result('uncertain');}
}
