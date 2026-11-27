'use client';
import {useEffect,useState} from 'react';
import {KnowledgeImportCentreReview} from './knowledge-import-centre-review';
import {createKnowledgeHistoryPollingReview,type KnowledgeHistorySnapshot} from '@/lib/knowledge-import-history-polling-review';
/** Unmounted review component; only a reviewed server composition may supply the scope key.
 * Key changes discard the previous session/workspace subtree before effects run. */
export function KnowledgeImportCentrePollingReview({scopeKey}:{scopeKey:string}){
 return <PollingView key={scopeKey}/>;
}
function PollingView(){
 const [snapshot,setSnapshot]=useState<KnowledgeHistorySnapshot>({state:'loading',rows:null});
 useEffect(()=>{
  let mounted=true;
  const poll=createKnowledgeHistoryPollingReview({origin:window.location.origin,emit:value=>{if(mounted)setSnapshot(value);},
   visible:()=>document.visibilityState==='visible',setTimer:(fn,ms)=>window.setTimeout(fn,ms),clearTimer:id=>window.clearTimeout(id as number)});
  const visibility=()=>poll.visibilityChanged();
  document.addEventListener('visibilitychange',visibility);void poll.refresh();
  return ()=>{mounted=false;document.removeEventListener('visibilitychange',visibility);poll.stop();};
 },[]);
 return <><p role="status">{snapshot.state==='loading'?'Checking authorized import history…':snapshot.state==='unavailable'?'Import history unavailable. No cached data is displayed.':'Import history is current.'}</p><KnowledgeImportCentreReview rows={snapshot.rows}/></>;
}
