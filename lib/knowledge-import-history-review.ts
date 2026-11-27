/** Metadata-only projection for the unmounted Import Centre; no database or auth access. */
export const KNOWLEDGE_IMPORT_CENTRE_RUNTIME_WIRED = false as const;
const statuses=['awaiting_upload','queued','processing','completed','failed','cancelled','expired'] as const;
type JobStatus=typeof statuses[number];
const keys=['pending','leased','created','invalid','duplicate','failed','cancelled'] as const;
type Counts=Record<typeof keys[number],number>;
export type ImportSummary={id:string;status:JobStatus;createdAt:string;bytes:number;total:number|null;processed:number;remaining:number|null;percent:number|null;counts:Counts;needsAttention:boolean};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function bounded(v:unknown,max:number):number|null{
  if(typeof v==='string'&&!/^(0|[1-9][0-9]*)$/.test(v))return null;
  if(typeof v!=='number'&&typeof v!=='string')return null;
  const n=Number(v);return Number.isSafeInteger(n)&&n>=0&&n<=max?n:null;
}
export function projectKnowledgeImportHistory(rows:unknown):ImportSummary[]|null{
  if(!Array.isArray(rows)||rows.length>25)return null;
  const out:ImportSummary[]=[],seen=new Set<string>();
  for(const row of rows){
    if(!row||typeof row!=='object'||Array.isArray(row)||typeof row.job_id!=='string'||!uuid.test(row.job_id)||seen.has(row.job_id)||
       !statuses.includes(row.job_status)||typeof row.created_at!=='string'||row.created_at.length>64||!Number.isFinite(Date.parse(row.created_at)))return null;
    const bytes=bounded(row.file_bytes,50*1024*1024),total=row.total_entries===null?null:bounded(row.total_entries,10000);
    if(bytes===null||bytes===0||(row.total_entries!==null&&(total===null||total===0)))return null;
    const counts={} as Counts;
    for(const key of keys){const n=bounded(row[key],10000);if(n===null)return null;counts[key]=n;}
    const sum=Object.values(counts).reduce((a,b)=>a+b,0),remaining=counts.pending+counts.leased,processed=sum-remaining;
    if((total===null&&sum!==0)||(total!==null&&sum!==total))return null;
    if(['completed','cancelled','expired','failed'].includes(row.job_status)&&remaining!==0)return null;
    if(row.job_status==='awaiting_upload'&&total!==null)return null;
    if(['queued','processing','completed'].includes(row.job_status)&&total===null)return null;
    seen.add(row.job_id);
    out.push({id:row.job_id,status:row.job_status,createdAt:row.created_at,bytes,total,processed,remaining:total===null?null:remaining,
      percent:total===null?null:Math.floor(processed*100/total),counts,needsAttention:counts.failed+counts.invalid>0||row.job_status==='failed'||row.job_status==='expired'});
  }
  return out;
}

/** Revalidate projected HTTP summaries before rendering; ignore unknown fields.
 * Reconstruct database-shaped rows so the existing view and invariants remain shared. */
export function decodeKnowledgeHistoryPage(value:unknown):{rows:Record<string,unknown>[];active:boolean}|null{
 if(!value||typeof value!=='object'||!('jobs' in value)||!Array.isArray(value.jobs)||value.jobs.length>25)return null;
 const rows:Record<string,unknown>[]=[];
 for(const j of value.jobs){
  if(!j||typeof j!=='object'||!j.counts||typeof j.counts!=='object'||Array.isArray(j.counts))return null;
  const row:Record<string,unknown>={job_id:j.id,job_status:j.status,created_at:j.createdAt,file_bytes:j.bytes,total_entries:j.total};
  for(const key of keys)row[key]=j.counts[key];
  rows.push(row);
 }
 const jobs=projectKnowledgeImportHistory(rows);
 if(!jobs)return null;
 return {rows,active:jobs.some(j=>['awaiting_upload','queued','processing'].includes(j.status))};
}
