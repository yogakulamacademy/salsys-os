import { knowledgeImportObjectPath, KNOWLEDGE_IMPORT_BUCKET } from './knowledge-import-upload-contract';

/** Review-only TUS configuration. No token issuer, transport dependency or runtime route. */
export const KNOWLEDGE_IMPORT_TUS_RUNTIME_WIRED = false as const;
export const KNOWLEDGE_TUS_CHUNK_BYTES=6*1024*1024;
type Reservation=Readonly<{organizationId:string;jobId:string;objectPath:string;declaredBytes:number;expiresAtMs:number}>;
type FileInfo=Readonly<{name:string;size:number;type:string}>;
/** Inputs must originate from an authorized server reservation and current user access token.
 * These local checks are not authorization. Storage RLS must independently enforce the reservation. */
export function buildKnowledgeTusReviewOptions(projectOrigin:string,reservation:Reservation,file:FileInfo,accessToken:string,nowMs:number){
  try{
    const origin=new URL(projectOrigin),path=knowledgeImportObjectPath(reservation.organizationId,reservation.jobId);
    if(origin.protocol!=='https:'||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash||origin.port||
      !/^[a-z0-9]+\.supabase\.co$/.test(origin.hostname)||!path||reservation.objectPath!==path||
      !Number.isSafeInteger(nowMs)||!Number.isSafeInteger(reservation.expiresAtMs)||nowMs>=reservation.expiresAtMs||
      !Number.isSafeInteger(file.size)||file.size<1||file.size>50*1024*1024||file.size!==reservation.declaredBytes||
      typeof file.name!=='string'||!file.name.toLowerCase().endsWith('.json')||
      !['','application/json'].includes(file.type)||typeof accessToken!=='string'||!accessToken||/\s/.test(accessToken))return null;
    return {
      endpoint:'https://'+origin.hostname.replace('.supabase.co','.storage.supabase.co')+'/storage/v1/upload/resumable',
      headers:{authorization:'Bearer '+accessToken},
      metadata:{bucketName:KNOWLEDGE_IMPORT_BUCKET,objectName:path,contentType:'application/json',cacheControl:'0'},
      chunkSize:KNOWLEDGE_TUS_CHUNK_BYTES,retryDelays:[0,3000,5000,10000,20000],
      uploadDataDuringCreation:true,removeFingerprintOnSuccess:true,storeFingerprintForResuming:false,
    };
  }catch{return null;}
}
