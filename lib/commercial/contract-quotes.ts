import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePlanAdminActor } from '@/lib/commercial/plan-admin';
import { useMockData } from '@/lib/config';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const digest=/^[a-f0-9]{64}$/;
const money=(v:unknown,max=4000000000)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=max;
const date=(v:unknown)=>typeof v==='string'&&Number.isFinite(Date.parse(v));
const code=(v:unknown)=>typeof v==='string'&&['free','basic','growth','pro'].includes(v);
export type QuoteQueueItem={id:string;organization_name:string;plan_code:string;version:number;amount_minor:number;setup_min_minor:number;setup_max_minor:number;setup_optional:boolean;tax_treatment:'inclusive'|'exclusive';requested_at:string};
export type CustomerQuote={id:string;request_id:string;terms_digest:string;plan_code:string;plan_version:number;monthly_minor:number;setup_minor:number;tax_minor:number;tax_treatment:'inclusive'|'exclusive';first_period_total_minor:number;currency:'INR';expires_at:string;accepted_at:string|null;offer_snapshot:Record<string,unknown>;state:'withdrawn'|'expired'|'stale'|'accepted_not_activated'|'awaiting_acceptance'|'unavailable'};

function enabled(){
  if(useMockData||process.env.SALSYS_CONTRACT_QUOTES_ENABLED!=='true')throw Error('Contract quotes unavailable.');
}
export async function listQuoteQueue():Promise<QuoteQueueItem[]>{
  enabled();
  const actor=await requirePlanAdminActor();
  const {data,error}=await createAdminClient().rpc('commercial_list_pending_contract_quotes_v1',{p_actor:actor});
  if(error||!Array.isArray(data)||data.length>100||!data.every((x:QuoteQueueItem)=>x&&UUID.test(x.id)&&typeof x.organization_name==='string'&&code(x.plan_code)&&Number.isInteger(x.version)&&x.version>0&&money(x.amount_minor)&&money(x.setup_min_minor)&&money(x.setup_max_minor)&&x.setup_max_minor>=x.setup_min_minor&&typeof x.setup_optional==='boolean'&&['inclusive','exclusive'].includes(x.tax_treatment)&&date(x.requested_at)))throw Error('Quote queue unavailable.');
  return data;
}
export async function prepareContractQuote(request:string,setup:number,tax:number,reason:string){
  enabled();
  if(!UUID.test(request)||!money(setup,1000000000)||!money(tax,2000000000)||reason.trim().length<10||reason.length>2048)throw Error('Invalid quote.');
  const actor=await requirePlanAdminActor();
  const {data,error}=await createAdminClient().rpc('commercial_prepare_contract_quote_v1',{p_actor:actor,p_request:request,p_setup_minor:setup,p_tax_minor:tax,p_reason:reason});
  if(error||typeof data!=='string'||!UUID.test(data))throw Error('Quote unavailable.');
  return data;
}
async function customerSession(){
  enabled();
  const client=await createClient();
  const {data:{user},error}=await client.auth.getUser();
  if(error||!user?.id||user.is_anonymous||!user.email_confirmed_at)throw Error('Access denied.');
  return client;
}
export async function loadCustomerQuotes():Promise<CustomerQuote[]>{
  const client=await customerSession();
  const {data,error}=await client.rpc('get_current_contract_quotes_v1');
  if(error||!Array.isArray(data)||data.length>50||!data.every((q:CustomerQuote)=>q&&UUID.test(q.id)&&UUID.test(q.request_id)&&digest.test(q.terms_digest)&&code(q.plan_code)&&Number.isInteger(q.plan_version)&&q.plan_version>0&&money(q.monthly_minor)&&money(q.setup_minor)&&money(q.tax_minor)&&money(q.first_period_total_minor)&&['inclusive','exclusive'].includes(q.tax_treatment)&&q.first_period_total_minor===q.monthly_minor+q.setup_minor+(q.tax_treatment==='exclusive'?q.tax_minor:0)&&q.currency==='INR'&&date(q.expires_at)&&(q.accepted_at===null||date(q.accepted_at))&&q.offer_snapshot&&typeof q.offer_snapshot==='object'&&!Array.isArray(q.offer_snapshot)&&['withdrawn','expired','stale','accepted_not_activated','awaiting_acceptance','unavailable'].includes(q.state)))throw Error('Quotes unavailable.');
  return data;
}
export async function acceptContractQuote(id:string,termsDigest:string){
  if(!UUID.test(id)||!digest.test(termsDigest))throw Error('Invalid quote reference.');
  const client=await customerSession();
  const {data,error}=await client.rpc('accept_current_contract_quote_v1',{p_quote:id,p_terms_digest:termsDigest});
  if(error||data!==true)throw Error('Quote acceptance unavailable.');
}
