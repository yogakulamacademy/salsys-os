import 'server-only';
import type { prepareKnowledgeImportSource } from './knowledge-import-source-preparation';

/** Review-only orchestration. No scheduler, network calls, credentials or live adapter. */
export const KNOWLEDGE_IMPORT_WORKER_RUNTIME_WIRED = false as const;
type Prepared = Extract<Awaited<ReturnType<typeof prepareKnowledgeImportSource>>, {ok:true}>;
type Payload = Prepared['batches'][number][number]['payload'];
type Scope = Readonly<{organizationId:string;jobId:string}>;
type Identity = Readonly<{objectPath:string;objectVersion:string;byteLength:number;sha256:string;manifestSha256:string}>;
type Claim = Readonly<{entry_index:number;lease_token:string;attempts:number}>;
type FailureCode = 'db_transient'|'invalid_payload';
type Finalize = {kind:'committed';documentId:string}|{kind:'confirmed_rollback';sqlstate:string}|{kind:'unknown'};
type Adapters = {
  readIdentity(scope:Scope):Promise<Identity>;
  // Must re-read immutable bytes, hash them, and independently derive the prepared manifest.
  prepareVerifiedSource(scope:Scope,identity:Identity):Promise<Prepared|null>;
  verifyManifest(scope:Scope,source:Prepared):Promise<boolean>;
  claim(scope:Scope,limit:number):Promise<readonly Claim[]>;
  finalize(scope:Scope,claim:Claim,payload:Payload):Promise<Finalize>;
  result(scope:Scope,claim:Claim):Promise<string|null>;
  settleFailure(scope:Scope,claim:Claim,code:FailureCode):Promise<'pending'|'failed'>;
};
type Report = {claimed:number;created:number;recovered:number;retried:number;failed:number;stop:'batch_complete'|'no_due_entries'|'source_rejected'|'authorization_or_adapter_error'|'invalid_claim'|'uncertain_outcome'|'unclassified_failure';mayExecute:false};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sha=/^[a-f0-9]{64}$/;
/** Only a trusted transactional adapter can assert confirmed rollback.
 * Unknown, connection and permission errors must never be treated as safe retries. */
export function classifyConfirmedKnowledgeRollback(sqlstate:string):FailureCode|null{
  if(['40001','40P01','55P03'].includes(sqlstate))return 'db_transient';
  if(['22023','22001'].includes(sqlstate))return 'invalid_payload';
  return null;
}
export async function runKnowledgeImportBatchReview(scope:Scope,a:Adapters,limit=5):Promise<Report>{
  const r:Report={claimed:0,created:0,recovered:0,retried:0,failed:0,stop:'batch_complete',mayExecute:false};
  const finish=(stop:Report['stop'])=>({...r,stop});
  if(!uuid.test(scope.organizationId)||!uuid.test(scope.jobId)||!Number.isInteger(limit)||limit<1||limit>10)return finish('invalid_claim');
  try{
    const identity=await a.readIdentity(scope);
    if(identity.objectPath!==scope.organizationId+'/'+scope.jobId+'/source.json'||!identity.objectVersion||identity.objectVersion.length>256||
      !Number.isSafeInteger(identity.byteLength)||identity.byteLength<1||identity.byteLength>50*1024*1024||
      !sha.test(identity.sha256)||!sha.test(identity.manifestSha256))return finish('source_rejected');
    const source=await a.prepareVerifiedSource(scope,identity);
    if(!source?.ok||source.objectVersion!==identity.objectVersion||source.sha256!==identity.sha256||source.byteLength!==identity.byteLength||
      !Array.isArray(source.manifest)||source.manifest.length<1||source.manifest.length>10000||
      source.manifest.some((m,i)=>m.index!==i))return finish('source_rejected');
    const payloads=new Map<number,Payload>();
    for(const b of source.batches)for(const e of b){
      if(payloads.has(e.index)||source.manifest[e.index]?.status!=='pending')return finish('source_rejected');
      payloads.set(e.index,e.payload);
    }
    if(payloads.size!==source.manifest.filter(m=>m.status==='pending').length||!await a.verifyManifest(scope,source))return finish('source_rejected');
    const claims=await a.claim(scope,limit);
    if(!Array.isArray(claims)||claims.length>limit)return finish('invalid_claim');
    r.claimed=claims.length;
    if(!claims.length)return finish('no_due_entries');
    if(new Set(claims.map(c=>c.entry_index)).size!==claims.length||
      claims.some(c=>!Number.isInteger(c.entry_index)||!payloads.has(c.entry_index)||!uuid.test(c.lease_token)||!Number.isInteger(c.attempts)||c.attempts<1||c.attempts>5))return finish('invalid_claim');
    for(const claim of claims){
      let outcome:Finalize;
      try{outcome=await a.finalize(scope,claim,payloads.get(claim.entry_index)!);}catch{outcome={kind:'unknown'};}
      if(outcome.kind==='committed'){
        if(!uuid.test(outcome.documentId))return finish('uncertain_outcome');
        r.created++;continue;
      }
      if(outcome.kind==='unknown'){
        try{
          const doc=await a.result(scope,claim);
          if(doc&&uuid.test(doc)){r.recovered++;continue;}
        }catch{/* unknown remains unknown; do not settle */}
        return finish('uncertain_outcome');
      }
      if(outcome.kind!=='confirmed_rollback')return finish('uncertain_outcome');
      const code=classifyConfirmedKnowledgeRollback(outcome.sqlstate);
      if(!code)return finish('unclassified_failure');
      const settled=await a.settleFailure(scope,claim,code);
      if(settled==='pending')r.retried++;
      else if(settled==='failed')r.failed++;
      else return finish('authorization_or_adapter_error');
    }
    return finish('batch_complete');
  }catch{return finish('authorization_or_adapter_error');}
}
