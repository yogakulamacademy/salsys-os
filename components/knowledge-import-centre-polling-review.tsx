'use client';
import {useEffect,useRef,useState} from 'react';
import {KnowledgeImportUploadPanelReview} from './knowledge-import-upload-panel-review';
import {KnowledgeImportCentreReview} from './knowledge-import-centre-review';
import {createKnowledgeHistoryPollingReview,type KnowledgeHistorySnapshot} from '@/lib/knowledge-import-history-polling-review';
/** Unmounted review component; only a reviewed server composition may supply the scope key.
 * Key changes discard the previous session/workspace subtree before effects run. */
export function KnowledgeImportCentrePollingReview({scopeKey}:{scopeKey:string}){
 return <PollingView key={scopeKey} scopeKey={scopeKey}/>;
}
function PollingView({scopeKey}:{scopeKey:string}){
 const refresh=useRef<(()=>void)|null>(null);
 const [snapshot,setSnapshot]=useState<KnowledgeHistorySnapshot>({state:'loading',rows:null});
 useEffect(()=>{
  let mounted=true;
  const poll=createKnowledgeHistoryPollingReview({origin:window.location.origin,scopeKey,emit:value=>{if(mounted)setSnapshot(value);},
   visible:()=>document.visibilityState==='visible',setTimer:(fn,ms)=>window.setTimeout(fn,ms),clearTimer:id=>window.clearTimeout(id as number)});
  const visibility=()=>poll.visibilityChanged();
  refresh.current=()=>{void poll.refresh();};
  document.addEventListener('visibilitychange',visibility);void poll.refresh();
  return ()=>{mounted=false;refresh.current=null;document.removeEventListener('visibilitychange',visibility);poll.stop();};
 },[scopeKey]);
 return <><p role="status">{snapshot.state==='loading'?'Checking authorized import history…':snapshot.state==='unavailable'?'Import history unavailable. No cached data is displayed.':'Import history is current.'}</p><KnowledgeImportCentreReview rows={snapshot.rows} uploadControls={snapshot.state==='ready'?<KnowledgeImportUploadPanelReview scopeKey={scopeKey} onChanged={()=>refresh.current?.()}/>:null}/></>;
}
