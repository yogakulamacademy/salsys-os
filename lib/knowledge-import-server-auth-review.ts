import 'server-only';
import {createClient} from '@/lib/supabase/server';
import {createKnowledgeRuntimeCompositionReview} from './knowledge-import-runtime-composition-review';
export const KNOWLEDGE_COOKIE_RUNTIME_WIRED=false as const;
type Options=Omit<Parameters<typeof createKnowledgeRuntimeCompositionReview>[0],'accessToken'|'verifyUser'>&{createAuthClient?:typeof createClient};
/** Server-only cookie bridge. Session storage is an untrusted token source, never
 * authority; getUser(exactToken) verifies with Auth before the restricted DB broker.
 * No client tenant, bearer override, shared auth client, service key or runtime enable flag.
 * Callers apply their deployment's enable switch before creating the runtime. */
export function createKnowledgeCookieRuntimeReview(o:Options){
 async function compose(){
  const client=await (o.createAuthClient??createClient)();
  async function candidate(){
   const {data,error}=await client.auth.getSession();
   const token=data?.session?.access_token;
   return !error&&typeof token==='string'&&token.length>0&&token.length<=16384?token:null;
  }
  const runtime=createKnowledgeRuntimeCompositionReview({
   origin:o.origin,issuer:o.issuer,uploadSeconds:o.uploadSeconds,retentionSeconds:o.retentionSeconds,now:o.now,
   openDedicatedApplication:o.openDedicatedApplication,providerFor:o.providerFor,
   accessToken:async request=>request.headers.has('authorization')?null:candidate(),
   verifyUser:async token=>{
    const {data,error}=await client.auth.getUser(token);
    const user=data?.user;
    return !error&&user?{id:user.id,is_anonymous:user.is_anonymous}:null;
   }
  });
  return {runtime,candidate};
 }
 return {
  async handle(request:Request){
   try{return await (await compose()).runtime(request);}
   catch{return new Response(JSON.stringify({error:'request_denied'}),{status:403,headers:{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'}});}
  },
  async resolveScope(expectedOrganizationId?:string){
   try{const {runtime,candidate}=await compose();return await runtime.resolveScopeFromToken(await candidate(),expectedOrganizationId);}
   catch{return null;}
  }
 };
}
