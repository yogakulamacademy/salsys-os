const CHUNK=1048576,MAX=50*CHUNK;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Outcome={state:'registered';status:'queued'|'completed'}|{state:'interrupted';confirmedBytes:number}|{state:'reconciliation_required'}|{state:'rejected'};
type Transport=typeof fetch;
type Options={jobId:string;file:File;origin:string;fetcher?:Transport;onProgress?:(bytes:number,total:number)=>void;signal?:AbortSignal};
/** Retain the instance only in memory. Revalidate all existing chunks against the same File
 * by exact replay on resume. No localStorage, provider URLs, bearer keys or tenant headers.
 * Once publication is attempted the instance cannot issue another publish request. */
export function createKnowledgeBrowserUploadReview(options:Options){
 const {file,jobId}=options;const origin=new URL(options.origin);
 if(origin.origin!==options.origin||!['https:','http:'].includes(origin.protocol)||(origin.protocol==='http:'&&!['localhost','127.0.0.1'].includes(origin.hostname)))throw Error('invalid origin');
 let writer:string|undefined,publicationGeneration:number|undefined,confirmed=0,busy=false,publishing=false,terminal:Outcome|undefined;
 const fetcher=options.fetcher??fetch;
 const send=async(op:string,headers:Record<string,string>,body?:Blob)=>{
  const response=await fetcher(origin.origin+'/api/knowledge-import-review/'+jobId+'/'+op,{method:'POST',credentials:'same-origin',redirect:'error',cache:'no-store',headers,body,signal:options.signal});
  if(response.status!==200)throw Error('request not confirmed');
  if(response.headers.get('content-type')?.split(';')[0]!=='application/json')throw Error('invalid receipt');
  return await response.json();
 };
 async function run():Promise<Outcome>{
  if(terminal)return terminal;
  if(busy)return {state:'interrupted',confirmedBytes:confirmed};
  if(publishing)return {state:'reconciliation_required'};
  if(!uuid.test(jobId)||!Number.isSafeInteger(file.size)||file.size<1||file.size>MAX||!file.name.toLowerCase().endsWith('.json')||!['','application/json'].includes(file.type))return {state:'rejected'};
  busy=true;
  try{
   // Client-generated random request ID also permits exact acquire replay after a lost response.
   writer??=crypto.randomUUID();
   const start=await send('acquire',{'x-knowledge-writer':writer});
   if(start.writer!==writer||!Number.isSafeInteger(start.generation)||start.generation<1||!Number.isSafeInteger(start.receivedBytes)||start.receivedBytes<0||start.receivedBytes>file.size||
     (start.receivedBytes!==file.size&&start.receivedBytes%CHUNK!==0))throw Error('invalid acquire receipt');
   const headers={'x-knowledge-writer':writer,'x-knowledge-generation':String(start.generation)};
   // Replay from zero, including already committed chunks: server rejects any byte mismatch.
   // Never claim progress based solely on an unverified resume offset.
   confirmed=0;
   for(let offset=0;offset<file.size;offset+=CHUNK){
    const end=Math.min(file.size,offset+CHUNK),part=file.slice(offset,end,'application/octet-stream');
    const ack=await send('append',{...headers,'x-knowledge-offset':String(offset),'x-knowledge-chunk-length':String(part.size),'content-type':'application/octet-stream'},part);
    if(!Number.isSafeInteger(ack.receivedBytes)||ack.receivedBytes<end||ack.receivedBytes>file.size||(ack.receivedBytes!==file.size&&ack.receivedBytes%CHUNK!==0))throw Error('invalid chunk receipt');
    confirmed=end;options.onProgress?.(confirmed,file.size);
   }
   publicationGeneration=start.generation;publishing=true;
   const result=await send('publish',headers);
   if(result.state!=='registered'||!['queued','completed'].includes(result.status))throw Error('unknown publication');
   terminal={state:'registered',status:result.status};return terminal;
  }catch{
   if(publishing){terminal={state:'reconciliation_required'};return terminal;}
   return {state:'interrupted',confirmedBytes:confirmed};
  }finally{busy=false;}
 }
 async function checkPublication():Promise<{state:'registered'|'reconciliation_required';jobStatus?:string}>{
  if(busy||!publishing||!writer||publicationGeneration===undefined)return {state:'reconciliation_required'};
  try{
   const receipt=await send('receipt',{'x-knowledge-writer':writer,'x-knowledge-generation':String(publicationGeneration)});
   if(receipt.state==='registered'&&['queued','processing','completed','failed','cancelled','expired'].includes(receipt.jobStatus))
     return {state:'registered',jobStatus:receipt.jobStatus};
   return {state:'reconciliation_required'};
  }catch{return {state:'reconciliation_required'};}
 }
 return Object.assign(run,{checkPublication});
}
