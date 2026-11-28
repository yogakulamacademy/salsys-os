import 'server-only';
import {createKnowledgeApplicationReview} from './knowledge-import-application-review';
import {createKnowledgeBrokerTransactionReview} from './knowledge-import-application-broker-review';
import {createKnowledgePublicationAdapterReview} from './knowledge-import-publication-adapter-review';

export const KNOWLEDGE_RUNTIME_COMPOSITION_WIRED=false as const;
type ApplicationOptions=Parameters<typeof createKnowledgeApplicationReview>[0];
type Provider=Parameters<typeof createKnowledgePublicationAdapterReview>[1];
type Scope=Parameters<typeof createKnowledgePublicationAdapterReview>[2];
type Open=Parameters<typeof createKnowledgeBrokerTransactionReview>[1];
type Options=Omit<ApplicationOptions,'connect'>&{openDedicatedApplication:Open;providerFor:(scope:Scope)=>Provider};
/** Disabled production composition; only trusted server/isolated fixtures may call the factory.
 * No credentials, environment flag, route activation, broad SQL or provider admin fallback.
 * Provider factory must be non-I/O; actual adapter rechecks the scoped reservation before I/O. */
export function createKnowledgeRuntimeCompositionReview(o:Options){
 return createKnowledgeApplicationReview({
  origin:o.origin,issuer:o.issuer,accessToken:o.accessToken,verifyUser:o.verifyUser,
  uploadSeconds:o.uploadSeconds,retentionSeconds:o.retentionSeconds,now:o.now,
  connect:async claims=>{
   let expected:string|undefined,closed=false;
   const query=createKnowledgeBrokerTransactionReview(claims,o.openDedicatedApplication,o.now,()=>expected);
   const scopedQuery:typeof query=async(statement,params)=>{
    if(closed)throw Error('application context closed');
    if(expected===undefined&&statement!=='select knowledge_import_review.current_scope() as organization_id')throw Error('scope not initialized');
    const result=await query(statement,params);
    if(statement==='select knowledge_import_review.current_scope() as organization_id'){
     const org=result.rows[0]?.organization_id;
     if(result.rows.length!==1||typeof org!=='string'||(expected!==undefined&&expected!==org))throw Error('scope unavailable');
     expected=org;
    }
    return result;
   };
   return {query:scopedQuery,publicationFor:scope=>{
    if(closed)throw Error('application context closed');
    return createKnowledgePublicationAdapterReview(scopedQuery,o.providerFor(scope),scope,o.now);
   },close:async()=>{closed=true;}};
  }
 });
}
