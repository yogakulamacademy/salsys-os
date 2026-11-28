import 'server-only';
import { createHash } from 'node:crypto';
import { planKnowledgeDraftImport, knowledgeImportUtf8Length, BULK_IMPORT_MAX_BYTES, BULK_IMPORT_BATCH_BYTES } from './knowledge-bulk-import-preflight';
import { inspectKnowledgeImportReceipt, knowledgeImportObjectPath, KNOWLEDGE_IMPORT_BUCKET } from './knowledge-import-upload-contract';

/** Review-only bridge: adapters must authenticate and pin immutable storage reads independently. */
export const KNOWLEDGE_IMPORT_SOURCE_RUNTIME_WIRED = false as const;
type Context = Parameters<typeof inspectKnowledgeImportReceipt>[0];
type Reservation = Parameters<typeof inspectKnowledgeImportReceipt>[1];
type Payload = Readonly<{title:string;category:string;content:string;source_name:string;source_type:string;source_uri:string|null}>;
type Manifest = {index:number;status:'pending';payload_sha256:string} | {index:number;status:'invalid'|'duplicate'};
type Source = Readonly<{bucket:string;objectPath:string;version:string;contentType:string;chunks:AsyncIterable<Uint8Array>}>;
type Pin = Readonly<{version:string;sha256?:string}>;
type Result = {ok:false;reason:string;mayExecute:false} | {ok:true;objectVersion:string;sha256:string;byteLength:number;manifest:Manifest[];batches:{index:number;payload:Payload}[][];mayExecute:false};
type ManifestResult=Extract<Result,{ok:false}>|Omit<Extract<Result,{ok:true}>,'batches'>;
const reject=(reason:string):Result=>({ok:false,reason,mayExecute:false});
const sha=/^[a-f0-9]{64}$/;
type DigestPayloads = (payloads:readonly Payload[])=>Promise<readonly string[]>;
/** Shared byte verifier, never an authorization boundary. */
async function prepareBytes(source:Source,pin:Pin,expectedBytes:number,digestPayloads:DigestPayloads,check:(bytes:number,digest:string,stage:'initial'|'read'|'final')=>string|null,retainBatches=true):Promise<Result>{
  try{
    if(typeof pin.version!=='string'||!pin.version||pin.version.length>256||source.version!==pin.version||
      (pin.sha256!==undefined&&!sha.test(pin.sha256)))return reject('object_version_mismatch');
    const initial=check(expectedBytes,'0'.repeat(64),'initial');if(initial)return reject(initial);
    const hash=createHash('sha256'), decoder=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true});
    let length=0; const parts:string[]=[];
    for await(const chunk of source.chunks){
      if(!(chunk instanceof Uint8Array))return reject('invalid_chunk');
      if(chunk.byteLength===0)continue;
      length+=chunk.byteLength;
      if(length>BULK_IMPORT_MAX_BYTES||length>expectedBytes)return reject('file_too_large');
      hash.update(chunk); parts.push(decoder.decode(chunk,{stream:true}));
    }
    parts.push(decoder.decode());
    const digest=hash.digest('hex');
    const checked=check(length,digest,'read');if(checked)return reject(checked);
    if(pin.sha256!==undefined&&pin.sha256!==digest)return reject('source_digest_mismatch');
    const plan=planKnowledgeDraftImport(parts.join(''));
    // Do not retain the decoded input chunks throughout asynchronous digest preparation.
    // Parsed strings may still reference source memory; GC timing is not guaranteed.
    parts.length=0;
    if(!plan.ok)return reject(plan.reason);
    const manifest:Manifest[]=plan.issues.map(i=>({index:i.index,status:i.reason==='duplicate_in_file'?'duplicate':'invalid'}));
    const batches:{index:number;payload:Payload}[][]=[];
    let batch:{index:number;payload:Payload}[]=[], batchBytes=2;
    // Digest each bounded mapped batch immediately. Publication retains only the manifest;
    // worker preparation retains its verified payloads for subsequent claims.
    const flush=async()=>{
      if(!batch.length)return true;
      const hashes=await digestPayloads(batch.map(e=>e.payload));
      if(!Array.isArray(hashes)||hashes.length!==batch.length||hashes.some(h=>typeof h!=='string'||!sha.test(h)))return false;
      batch.forEach((e,i)=>manifest.push({index:e.index,status:'pending',payload_sha256:hashes[i]}));
      if(retainBatches)batches.push(batch);
      batch=[];batchBytes=2;return true;
    };
    for(const entries of plan.batches)for(const entry of entries){
      const d=entry.draft;
      const mapped={index:entry.index,payload:{title:(d.review_flag?'⚠ ':'')+d.title,category:d.category,content:d.content,
        source_name:d.source_name+(d.review_flag?' · Review: '+d.review_flag:''),source_type:d.source_type,source_uri:d.source_uri}};
      const size=knowledgeImportUtf8Length(JSON.stringify(mapped));
      if(size+2>BULK_IMPORT_BATCH_BYTES)return reject('batch_too_large');
      if(batch.length&&(batch.length>=50||batchBytes+1+size>BULK_IMPORT_BATCH_BYTES)){
        if(!await flush())return reject('invalid_payload_digest');
      }
      batchBytes+=size+(batch.length?1:0);
      batch.push(mapped);
    }
    if(!await flush())return reject('invalid_payload_digest');
    manifest.sort((a,b)=>a.index-b.index);
    if(manifest.length!==plan.total||manifest.some((e,i)=>e.index!==i))return reject('manifest_partition_mismatch');
    if(knowledgeImportUtf8Length(JSON.stringify(manifest))>2*1024*1024)return reject('manifest_too_large');
    const last=check(length,digest,'final');if(last)return reject(last);
    return {ok:true,objectVersion:pin.version,sha256:digest,byteLength:length,manifest,batches,mayExecute:false};
  }catch{return reject('source_preparation_failed');}
}
async function prepareUpload(context:Context,reservation:Reservation,pin:Pin,source:Source,digestPayloads:DigestPayloads,now:()=>number,retainBatches:boolean):Promise<Result>{
  return prepareBytes(source,pin,reservation.declaredBytes,digestPayloads,(bytes,digest,stage)=>{
    const result=inspectKnowledgeImportReceipt(context,reservation,{bucket:source.bucket,objectPath:source.objectPath,byteLength:bytes,sha256:digest,contentType:source.contentType},now());
    return result.ok?null:stage==='final'?'reservation_no_longer_valid':result.reason;
  },retainBatches);
}
export async function prepareKnowledgeImportSource(context:Context,reservation:Reservation,pin:Pin,source:Source,digestPayloads:DigestPayloads,now:()=>number):Promise<Result>{
  return prepareUpload(context,reservation,pin,source,digestPayloads,now,true);
}
/** Same validation and canonical digest partition, but never return document payloads to publication. */
export async function prepareKnowledgeImportManifest(context:Context,reservation:Reservation,pin:Pin,source:Source,digestPayloads:DigestPayloads,now:()=>number):Promise<ManifestResult>{
  const result=await prepareUpload(context,reservation,pin,source,digestPayloads,now,false);
  if(!result.ok)return result;
  return {ok:true,objectVersion:result.objectVersion,sha256:result.sha256,byteLength:result.byteLength,manifest:result.manifest,mayExecute:false};
}
/** Worker input must come from the restricted DB identity function. No upload-expiry or fabricated user context.
 * Byte/hash verification is not permission; actual claim/finalize recheck delegation transactionally. */
export async function prepareKnowledgeWorkerSource(scope:{organizationId:string;jobId:string},identity:{objectPath:string;objectVersion:string;byteLength:number;sha256:string},source:Source,digestPayloads:DigestPayloads):Promise<Result>{
  const path=knowledgeImportObjectPath(scope.organizationId,scope.jobId);
  if(!path||identity.objectPath!==path||source.objectPath!==path||source.bucket!==KNOWLEDGE_IMPORT_BUCKET||source.contentType!=='application/json')return reject('object_mismatch');
  if(!Number.isSafeInteger(identity.byteLength)||identity.byteLength<1||identity.byteLength>BULK_IMPORT_MAX_BYTES||!sha.test(identity.sha256))return reject('invalid_object');
  return prepareBytes(source,{version:identity.objectVersion,sha256:identity.sha256},identity.byteLength,digestPayloads,(bytes)=>bytes===identity.byteLength?null:'invalid_object');
}
