import {createKnowledgeBrowserUploadReview} from './knowledge-import-browser-review';
export type KnowledgeUploadFlowState='ready'|'reserving'|'uploading'|'interrupted'|'registered'|'reconciliation_required'|'cancelled'|'rejected';
type State={state:KnowledgeUploadFlowState;confirmedBytes:number;totalBytes:number;jobStatus?:string};
const MAX=50*1048576,uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validKnowledgeImportFile(file:File):boolean{
 return Number.isSafeInteger(file.size)&&file.size>0&&file.size<=MAX&&file.name.toLowerCase().endsWith('.json')&&['','application/json'].includes(file.type);
}
/** One user-selected file, one job, in memory only. Retry reservation with the same ID;
 * never re-publish after an uncertain write. Cancellation is explicit, not an unmount effect. */
export function createKnowledgeUploadFlowReview(o:{origin:string;file:File;jobId:string;scopeKey?:string;fetcher?:typeof fetch;emit:(state:State)=>void}){
 const origin=new URL(o.origin);
 if(origin.origin!==o.origin||!['http:','https:'].includes(origin.protocol)||(origin.protocol==='http:'&&!['localhost','127.0.0.1'].includes(origin.hostname))||!uuid.test(o.jobId))throw Error('invalid import context');
 const transport=o.fetcher??fetch,abort=new AbortController();
 if(o.scopeKey!==undefined&&!/^[a-f0-9]{64}$/.test(o.scopeKey))throw Error('invalid scope marker');
 const fetcher:typeof fetch=(input,init)=>{
  const headers=new Headers(init?.headers);
  if(o.scopeKey!==undefined)headers.set('x-knowledge-scope',o.scopeKey);
  // Preserve plain header objects for existing fixture transport bridges.
  return transport(input,{...init,headers:Object.fromEntries(headers)});
 };
 let current:State={state:validKnowledgeImportFile(o.file)?'ready':'rejected',confirmedBytes:0,totalBytes:o.file.size};
 let reserved=false,busy=false,stopped=false,attemptedReservation=false;
 const update=(state:KnowledgeUploadFlowState,bytes=current.confirmedBytes,jobStatus?:string)=>{
  if(!stopped){current={state,confirmedBytes:bytes,totalBytes:o.file.size,...(jobStatus?{jobStatus}:{})};o.emit({...current});}
 };
 const upload=createKnowledgeBrowserUploadReview({origin:o.origin,jobId:o.jobId,file:o.file,fetcher,signal:abort.signal,onProgress:bytes=>update('uploading',bytes)});
 async function send(op:'reserve'|'cancel',headers:Record<string,string>={}){
  const r=await fetcher(origin.origin+'/api/knowledge-import-review/'+o.jobId+'/'+op,{method:'POST',credentials:'same-origin',redirect:'error',cache:'no-store',headers,signal:abort.signal});
  if(r.status!==200||r.headers.get('content-type')?.split(';')[0]!=='application/json')throw Error('unconfirmed request');
  return r.json();
 }
 async function start(){
  if(stopped||busy||!['ready','interrupted'].includes(current.state))return;
  busy=true;
  try{
   if(!reserved){
    update('reserving',0);attemptedReservation=true;
    const ack=await send('reserve',{'x-knowledge-file-bytes':String(o.file.size)});
    if(ack.jobId!==o.jobId||ack.status!=='awaiting_upload')throw Error('unconfirmed reservation');
    reserved=true;
   }
   if(stopped)return;
   update('uploading',0);
   const result=await upload();
   if(result.state==='registered')update('registered',o.file.size,result.status);
   else if(result.state==='interrupted')update('interrupted',result.confirmedBytes);
   else update(result.state);
  }catch{update('interrupted');}finally{busy=false;}
 }
 async function check(){
  if(stopped||busy||current.state!=='reconciliation_required')return;
  busy=true;
  try{const r=await upload.checkPublication();if(r.state==='registered')update('registered',o.file.size,r.jobStatus);}
  finally{busy=false;}
 }
 async function cancel(){
  if(stopped||busy||!attemptedReservation||['cancelled','rejected'].includes(current.state))return;
  busy=true;const previous=current.state;
  try{const ack=await send('cancel');if(ack.status!=='cancelled')throw Error('unconfirmed cancellation');update('cancelled');}
  catch{update(previous==='registered'?'registered':previous,current.confirmedBytes,current.jobStatus);}
  finally{busy=false;}
 }
 return {start,check,cancel,snapshot:()=>({...current}),stop:()=>{stopped=true;abort.abort();}};
}
