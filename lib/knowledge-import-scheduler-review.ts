import 'server-only';
import {runKnowledgeImportBatchReview} from './knowledge-import-worker-review';
export const KNOWLEDGE_IMPORT_SCHEDULER_RUNTIME_WIRED=false as const;
type Query=(sql:string,params:unknown[])=>Promise<{rows:Record<string,unknown>[]}>;
type Adapters=Parameters<typeof runKnowledgeImportBatchReview>[1];
type Scope=Parameters<typeof runKnowledgeImportBatchReview>[0];
type Report=Awaited<ReturnType<typeof runKnowledgeImportBatchReview>>;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** Executes one bounded scheduler tick using the SAME restricted worker login for discovery and
 * processing. Not a cron endpoint, queue consumer, delegation issuer or credential provider.
 * Deadline is checked between jobs; transports must enforce their own statement/network deadlines. */
export async function runKnowledgeImportSchedulerReview(query:Query,adapters:Adapters,options:{jobs?:number;batchSize?:number;batches?:number;budgetMs?:number;now?:()=>number}={}){
 const jobs=options.jobs??1,batchSize=options.batchSize??10,batches=options.batches??5,budget=options.budgetMs??90000,now=options.now??Date.now;
 const reports:{scope:Scope;report:Report}[]=[];
 const finish=(stop:'complete'|'budget'|'blocked'|'invalid_options')=>({stop,reports,mayExecute:false as const});
 if(!Number.isInteger(jobs)||jobs<1||jobs>3||!Number.isInteger(batchSize)||batchSize<1||batchSize>10||!Number.isInteger(batches)||batches<1||batches>5||!Number.isInteger(budget)||budget<1000||budget>120000)return finish('invalid_options');
 const started=now();
 try{
  const {rows}=await query('select * from knowledge_import_review.worker_due_jobs($1)',[jobs]);
  if(!Array.isArray(rows)||rows.length>jobs)return finish('blocked');
  const seen=new Set<string>(),scopes:Scope[]=[];
  for(const row of rows){
   if(typeof row.organization_id!=='string'||typeof row.job_id!=='string'||!uuid.test(row.organization_id)||!uuid.test(row.job_id))return finish('blocked');
   const key=row.organization_id+'/'+row.job_id;if(seen.has(key))return finish('blocked');seen.add(key);
   scopes.push({organizationId:row.organization_id,jobId:row.job_id});
  }
  for(const scope of scopes){
   if(now()-started>=budget)return finish('budget');
   const report=await runKnowledgeImportBatchReview(scope,adapters,batchSize,batches);
   reports.push({scope,report});
   if(!['batch_complete','no_due_entries'].includes(report.stop))return finish('blocked');
  }
  return finish('complete');
 }catch{return finish('blocked');}
}
