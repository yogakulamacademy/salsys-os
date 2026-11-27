import 'server-only';
import { createHash } from 'node:crypto';
import { planKnowledgeDraftImport, BULK_IMPORT_MAX_BYTES, BULK_IMPORT_BATCH_BYTES } from './knowledge-bulk-import-preflight';
import { inspectKnowledgeImportReceipt } from './knowledge-import-upload-contract';

/** Review-only bridge: adapters must authenticate and pin immutable storage reads independently. */
export const KNOWLEDGE_IMPORT_SOURCE_RUNTIME_WIRED = false as const;
type Context = Parameters<typeof inspectKnowledgeImportReceipt>[0];
type Reservation = Parameters<typeof inspectKnowledgeImportReceipt>[1];
type Payload = Readonly<{title:string;category:string;content:string;source_name:string;source_type:string;source_uri:string|null}>;
type Manifest = {index:number;status:'pending';payload_sha256:string} | {index:number;status:'invalid'|'duplicate'};
type Source = Readonly<{bucket:string;objectPath:string;version:string;contentType:string;chunks:AsyncIterable<Uint8Array>}>;
type Pin = Readonly<{version:string;sha256?:string}>;
type Result = {ok:false;reason:string;mayExecute:false} | {ok:true;objectVersion:string;sha256:string;byteLength:number;manifest:Manifest[];batches:{index:number;payload:Payload}[][];mayExecute:false};
const reject=(reason:string):Result=>({ok:false,reason,mayExecute:false});
const sha=/^[a-f0-9]{64}$/;
const encoder=new TextEncoder();
/** Digest callback must use PostgreSQL jsonb text canonicalization, never client-supplied hashes. */
export async function prepareKnowledgeImportSource(context:Context,reservation:Reservation,pin:Pin,source:Source,
    digestPayloads:(payloads:readonly Payload[])=>Promise<readonly string[]>, now:()=>number):Promise<Result>{
  try {
    if(typeof pin.version!=='string'||!pin.version||pin.version.length>256||source.version!==pin.version||
      (pin.sha256!==undefined&&!sha.test(pin.sha256))) return reject('object_version_mismatch');
    // Preflight identity and path before reading any bytes. Dummy digest is only a shape placeholder.
    const receipt={bucket:source.bucket,objectPath:source.objectPath,byteLength:reservation.declaredBytes,sha256:'0'.repeat(64),contentType:source.contentType};
    const initial=inspectKnowledgeImportReceipt(context,reservation,receipt,now());
    if(!initial.ok)return reject(initial.reason);
    const hash=createHash('sha256'), decoder=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true});
    let length=0; const parts:string[]=[];
    for await(const chunk of source.chunks){
      if(!(chunk instanceof Uint8Array))return reject('invalid_chunk');
      if(chunk.byteLength===0)continue;
      length+=chunk.byteLength;
      if(length>BULK_IMPORT_MAX_BYTES||length>reservation.declaredBytes)return reject('file_too_large');
      hash.update(chunk); parts.push(decoder.decode(chunk,{stream:true}));
    }
    parts.push(decoder.decode());
    const digest=hash.digest('hex');
    const checked=inspectKnowledgeImportReceipt(context,reservation,{...receipt,byteLength:length,sha256:digest},now());
    if(!checked.ok)return reject(checked.reason);
    if(pin.sha256!==undefined&&pin.sha256!==digest)return reject('source_digest_mismatch');
    const plan=planKnowledgeDraftImport(parts.join(''));
    if(!plan.ok)return reject(plan.reason);
    const manifest:Manifest[]=plan.issues.map(i=>({index:i.index,status:i.reason==='duplicate_in_file'?'duplicate':'invalid'}));
    const batches:{index:number;payload:Payload}[][]=[];
    let batch:{index:number;payload:Payload}[]=[];
    for(const entries of plan.batches)for(const entry of entries){
      const d=entry.draft;
      const mapped={index:entry.index,payload:{title:(d.review_flag?'⚠ ':'')+d.title,category:d.category,content:d.content,
        source_name:d.source_name+(d.review_flag?' · Review: '+d.review_flag:''),source_type:d.source_type,source_uri:d.source_uri}};
      if(batch.length&&(batch.length>=50||encoder.encode(JSON.stringify([...batch,mapped])).byteLength>BULK_IMPORT_BATCH_BYTES)){batches.push(batch);batch=[];}
      if(encoder.encode(JSON.stringify([mapped])).byteLength>BULK_IMPORT_BATCH_BYTES)return reject('batch_too_large');
      batch.push(mapped);
    }
    if(batch.length)batches.push(batch);
    for(const b of batches){
      const hashes=await digestPayloads(b.map(e=>e.payload));
      if(!Array.isArray(hashes)||hashes.length!==b.length||hashes.some(h=>typeof h!=='string'||!sha.test(h)))return reject('invalid_payload_digest');
      b.forEach((e,i)=>manifest.push({index:e.index,status:'pending',payload_sha256:hashes[i]}));
    }
    manifest.sort((a,b)=>a.index-b.index);
    if(manifest.length!==plan.total||manifest.some((e,i)=>e.index!==i))return reject('manifest_partition_mismatch');
    if(encoder.encode(JSON.stringify(manifest)).byteLength>2*1024*1024)return reject('manifest_too_large');
    // Expiry is checked again after hashing; actual enqueue must re-read current authority transactionally.
    if(!inspectKnowledgeImportReceipt(context,reservation,{...receipt,byteLength:length,sha256:digest},now()).ok)return reject('reservation_no_longer_valid');
    return {ok:true,objectVersion:pin.version,sha256:digest,byteLength:length,manifest,batches,mayExecute:false};
  }catch{return reject('source_preparation_failed');}
}
