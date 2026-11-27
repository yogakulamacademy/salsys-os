'use client';
import {useEffect,useRef,useState} from 'react';
import {createKnowledgeUploadFlowReview,validKnowledgeImportFile,type KnowledgeUploadFlowState} from '@/lib/knowledge-import-upload-flow-review';
type Flow=ReturnType<typeof createKnowledgeUploadFlowReview>;
/** Isolated, unmounted upload panel. A verified server scope key must remount it on
 * session/workspace change. No active production page imports this component. */
export function KnowledgeImportUploadPanelReview({scopeKey}:{scopeKey:string}){
 return <UploadPanel key={scopeKey}/>;
}
function UploadPanel(){
 const flow=useRef<Flow|null>(null),running=useRef(false);
 const [file,setFile]=useState<File|null>(null),[state,setState]=useState<ReturnType<Flow['snapshot']>|null>(null),[busy,setBusy]=useState(false);
 useEffect(()=>()=>{flow.current?.stop();flow.current=null;},[]);
 const status:KnowledgeUploadFlowState=state?.state??'ready';
 const locked=busy||Boolean(flow.current&& !['registered','cancelled','rejected'].includes(status));
 const act=async(op:'start'|'check'|'cancel')=>{
  if(running.current)return;
  if(!flow.current){
   if(op!=='start'||!file||!validKnowledgeImportFile(file))return;
   flow.current=createKnowledgeUploadFlowReview({origin:window.location.origin,file,jobId:crypto.randomUUID(),emit:setState});
  }
  running.current=true;setBusy(true);
  try{await flow.current[op]();}finally{running.current=false;setBusy(false);}
 };
 return <section aria-label="Isolated Knowledge file upload">
  <h3>Import Knowledge JSON</h3><p>Isolated integration only. Up to 50 MiB; imported entries are drafts.</p>
  <label>Choose JSON file <input type="file" accept=".json,application/json" disabled={locked} onChange={e=>{flow.current?.stop();flow.current=null;setState(null);setFile(e.target.files?.[0]??null);}}/></label>
  {file&&!validKnowledgeImportFile(file)?<p role="alert">Choose a non-empty JSON file up to 50 MiB.</p>:null}
  {state?<><p role="status">{status==='reconciliation_required'?'Publication outcome uncertain. Check receipt; do not upload again.':status==='registered'?'Source registered. Processing status is shown in import history.':status==='interrupted'?'Upload interrupted. Retry the same file and job.':status.replaceAll('_',' ')}</p><progress aria-label="Confirmed uploaded bytes" max={state.totalBytes||1} value={state.confirmedBytes}/></>:null}
  <div>
   <button type="button" disabled={busy||!file||!validKnowledgeImportFile(file)||!['ready','interrupted'].includes(status)} onClick={()=>void act('start')}>{status==='interrupted'?'Resume upload':'Start import'}</button>
   {status==='reconciliation_required'?<button type="button" disabled={busy} onClick={()=>void act('check')}>Check publication receipt</button>:null}
   {flow.current&&!['ready','cancelled','rejected'].includes(status)?<button type="button" disabled={busy} onClick={()=>void act('cancel')}>Cancel import</button>:null}
  </div>
 </section>;
}
