import 'server-only';
import {createKnowledgeWorkerSourceAdaptersReview,readSignedKnowledgeSource} from './knowledge-import-worker-adapters-review';
import {KNOWLEDGE_IMPORT_BUCKET,knowledgeImportObjectPath} from './knowledge-import-upload-contract';
import {runKnowledgeImportSchedulerReview} from './knowledge-import-scheduler-review';
export const KNOWLEDGE_WORKER_COMPOSITION_WIRED=false as const;
type Query=Parameters<typeof createKnowledgeWorkerSourceAdaptersReview>[0];
type Reader=Parameters<typeof createKnowledgeWorkerSourceAdaptersReview>[1];
type Adapters=ReturnType<typeof createKnowledgeWorkerSourceAdaptersReview>;
type Identity=Awaited<ReturnType<Adapters['readIdentity']>>;
type Connection={query:Query;destroy:()=>Promise<void>};
type Options={expectedLogin:string;openDedicatedWorker:()=>Promise<Connection>;readSource:Reader;windowBatches?:number;budgetMs?:number};
const operations=new Map<string,number>([
 ['select * from knowledge_import_review.worker_due_jobs($1)',1],
 ['select * from knowledge_import_review.worker_source_identity($1,$2)',2],
 ['select * from knowledge_import_review.worker_digest_payloads($1,$2,$3::jsonb)',3],
 ['select knowledge_import_review.worker_verify_manifest($1,$2,$3,$4,$5,$6::jsonb) as ok',6],
 ['select * from knowledge_import_review.worker_claim($1,$2,$3)',3],
 ['select knowledge_import_review.worker_finalize($1,$2,$3,$4,$5,$6::jsonb) as id',6],
 ['select knowledge_import_review.worker_result($1,$2,$3,$4,$5) as id',5],
 ['select knowledge_import_review.worker_settle_failure($1,$2,$3,$4,$5,$6) as status',6],
]);
const loginCheck="select session_user::text as login, current_user=session_user and rolcanlogin and not rolsuper and not rolbypassrls and not rolcreaterole and not rolcreatedb and not rolreplication and not exists(select 1 from pg_auth_members m where m.member=r.oid) as restricted from pg_roles r where r.rolname=session_user";
function same(a:Identity,b:Identity){return a.objectPath===b.objectPath&&a.objectVersion===b.objectVersion&&a.byteLength===b.byteLength&&a.sha256===b.sha256&&a.manifestSha256===b.manifestSha256;}
/** One disabled, explicitly invoked worker window. A dedicated driver must enforce
 * connection/network deadlines and destroy rather than recycle the login session.
 * No JWT impersonation, general SQL endpoint, credential creation or scheduler registration.
 * Failed statements are not replayed; an explicit receipt lookup may acquire a fresh connection. */
export async function runKnowledgeWorkerRuntimeReview(o:Options){
 if(!/^[a-z][a-z0-9_]{0,62}$/.test(o.expectedLogin))throw Error('invalid worker login');
 let conn:Connection|undefined,closed=false;
 async function discard(){const old=conn;conn=undefined;if(old)await old.destroy();}
 async function ready(){
  if(closed)throw Error('worker window closed');
  if(!conn){
   conn=await o.openDedicatedWorker();
   try{
    const {rows}=await conn.query(loginCheck,[]);
    if(rows.length!==1||rows[0].login!==o.expectedLogin||rows[0].restricted!==true)throw Error('worker login denied');
    await conn.query("set statement_timeout='15s'",[]);
    await conn.query("set lock_timeout='5s'",[]);
    await conn.query("set idle_in_transaction_session_timeout='15s'",[]);
   }catch(e){await discard();throw e;}
  }
  return conn;
 }
 const query:Query=async(statement,params)=>{
  const arity=operations.get(statement);
  if(arity===undefined||!Array.isArray(params)||params.length!==arity)throw Error('worker operation denied');
  const c=await ready();
  try{return await c.query(statement,params);}
  catch(e){await discard();throw e;}
 };
 let adapters:Adapters;
 adapters=createKnowledgeWorkerSourceAdaptersReview(query,async(scope,identity)=>{
  if(!same(await adapters.readIdentity(scope),identity))throw Error('source authority changed');
  const source=await o.readSource(scope,identity);
  // Delegation and complete ledger identity are rechecked after the external read.
  // The independently authorized provider reader must additionally pin actual version.
  return {...source,chunks:(async function*(){
   yield* source.chunks;
   if(!same(await adapters.readIdentity(scope),identity))throw Error('source authority changed');
  })()};
 });
 try{
  return await runKnowledgeImportSchedulerReview(query,adapters,{jobs:1,batchSize:10,windowBatches:o.windowBatches??200,budgetMs:o.budgetMs??90000});
 }finally{closed=true;await discard();}
}
/** Production-shaped signed read composition, never invoked by a mounted route.
 * The issuer is an independent trusted capability service, not the worker login. */
export function runKnowledgeSignedWorkerRuntimeReview(o:Omit<Options,'readSource'>&{projectOrigin:string;issueReadUrl:Parameters<typeof readSignedKnowledgeSource>[3];fetcher?:typeof fetch}){
 return runKnowledgeWorkerRuntimeReview({...o,readSource:(scope,identity)=>readSignedKnowledgeSource(scope,identity,o.projectOrigin,o.issueReadUrl,o.fetcher)});
}

type IssueReadUrl=Parameters<typeof readSignedKnowledgeSource>[3];
type ReadScope=Parameters<IssueReadUrl>[0];
type ReadGrant={identity:Identity;expiresAtMs:number};
type ReadIssuerOptions={
 // The issuer's own authority resolves a fresh grant for the authenticated worker and job.
 resolveGrant:(scope:ReadScope)=>Promise<ReadGrant|null>;
 storage:{from:(bucket:string)=>{createSignedUrl:(path:string,expiresIn:number,options:{versionId:string})=>Promise<{
  data:{signedUrl:string}|null;error:unknown;
 }>}};
 now?:()=>number;
};

/** Server-only composition for an explicitly invoked worker. The injected grant resolver
 * and Storage signer belong to the issuer, outside the restricted worker database login. */
export function runKnowledgeVersionedWorkerRuntimeReview(
 o:Omit<Parameters<typeof runKnowledgeSignedWorkerRuntimeReview>[0],'issueReadUrl'> & {issuer:ReadIssuerOptions}
){
 const {issuer,...worker}=o;
 const now=issuer.now??Date.now;
 const issueReadUrl:IssueReadUrl=async(scope,expected)=>{
  const grant=await issuer.resolveGrant(scope);
  const path=knowledgeImportObjectPath(scope.organizationId,scope.jobId);
  if(!grant||!path||grant.identity.objectPath!==path||!same(grant.identity,expected)||
    !Number.isSafeInteger(grant.expiresAtMs))throw Error('source read grant denied');

  const expiresIn=Math.min(30,Math.floor((grant.expiresAtMs-now())/1000));
  if(!Number.isSafeInteger(expiresIn)||expiresIn<1)throw Error('source read grant expired');

  const {data,error}=await issuer.storage.from(KNOWLEDGE_IMPORT_BUCKET)
   .createSignedUrl(path,expiresIn,{versionId:grant.identity.objectVersion});
  if(error||!data?.signedUrl||now()>=grant.expiresAtMs)throw Error('source read signing failed');
  return data.signedUrl;
 };
 return runKnowledgeSignedWorkerRuntimeReview({...worker,issueReadUrl});
}
