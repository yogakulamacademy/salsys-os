import {decodeKnowledgeHistoryPage} from './knowledge-import-history-review';
export const KNOWLEDGE_IMPORT_POLLING_RUNTIME_WIRED=false as const;
export type KnowledgeHistorySnapshot={state:'loading'|'ready'|'unavailable';rows:Record<string,unknown>[]|null};
type Options={origin:string;fetcher?:typeof fetch;emit:(snapshot:KnowledgeHistorySnapshot)=>void;visible:()=>boolean;setTimer:(fn:()=>void,ms:number)=>unknown;clearTimer:(id:unknown)=>void};
/** In-memory, non-overlapping polling. A hidden view or failed request clears tenant metadata.
 * The caller MUST destroy the controller on workspace/session changes and unmount.
 * No background poll, persistent cache, or client-provided organization ID. */
export function createKnowledgeHistoryPollingReview(o:Options){
 const origin=new URL(o.origin);
 if(origin.origin!==o.origin||!['http:','https:'].includes(origin.protocol)||(origin.protocol==='http:'&&!['localhost','127.0.0.1'].includes(origin.hostname)))throw Error('invalid origin');
 let stopped=false,epoch=0,timer:unknown,controller:AbortController|undefined,failures=0;
 const fetcher=o.fetcher??fetch;
 function reset(){epoch++;if(timer!==undefined){o.clearTimer(timer);timer=undefined;}controller?.abort();controller=undefined;}
 function schedule(ms:number){if(!stopped&&o.visible())timer=o.setTimer(()=>{timer=undefined;void refresh();},ms);}
 async function refresh(){
  if(stopped)return;
  reset();const current=epoch;
  if(!o.visible()){o.emit({state:'loading',rows:null});return;}
  const abort=new AbortController();controller=abort;
  const timeout=o.setTimer(()=>abort.abort(),15000);
  try{
   const r=await fetcher(origin.origin+'/api/knowledge-import-review/history',{method:'GET',credentials:'same-origin',redirect:'error',cache:'no-store',signal:abort.signal});
   if(stopped||current!==epoch)return;
   if(r.status===401||r.status===403){o.emit({state:'unavailable',rows:null});stopped=true;return;}
   if(r.status!==200||r.headers.get('content-type')?.split(';')[0]!=='application/json')throw Error('history unavailable');
   const data=decodeKnowledgeHistoryPage(await r.json());
   if(stopped||current!==epoch)return;
   if(abort.signal.aborted||!o.visible()||!data)throw Error('history unavailable');
   failures=0;o.emit({state:'ready',rows:data.rows});schedule(data.active?5000:30000);
  }catch{
   if(stopped||current!==epoch)return;
   o.emit({state:'unavailable',rows:null});failures++;schedule(Math.min(60000,5000*2**Math.min(failures,4)));
  }finally{o.clearTimer(timeout);if(current===epoch)controller=undefined;}
 }
 function visibilityChanged(){if(stopped)return;if(!o.visible()){reset();o.emit({state:'loading',rows:null});}else void refresh();}
 function stop(){stopped=true;reset();o.emit({state:'loading',rows:null});}
 return {refresh,visibilityChanged,stop};
}
