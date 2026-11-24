import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { useMockData } from '@/lib/config';

export type PublishedOffer = {plan_id:string;version:number;digest:string;code:string;display_name:string;amount_minor:number;currency:'INR';billing_period:'month';setup_min_minor:number;setup_max_minor:number;setup_optional:boolean;tax_treatment:'inclusive'|'exclusive';named_users:number;lead_records:number};
export type ChangeRequest = {id:string;status:'requested'|'withdrawn'|'activated'|'superseded';request_origin:'customer'|'admin';target_code:string;target_version:number;amount_minor:number;currency:'INR';requested_at:string;withdrawn_at:string|null};
export type ChangeOptions = {state:'available';subscription_revision:string;offers:PublishedOffer[];requests:ChangeRequest[]}|{state:'unavailable';requests:ChangeRequest[]};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const integer=(x:unknown,min=0)=>typeof x==='number'&&Number.isSafeInteger(x)&&x>=min;
const date=(x:unknown)=>typeof x==='string'&&Number.isFinite(Date.parse(x));
const code=(x:unknown)=>typeof x==='string'&&['free','basic','growth','pro'].includes(x);
async function session(){
  if(useMockData||process.env.SALSYS_PLAN_CHANGE_REQUESTS_ENABLED!=='true')throw Error('Plan changes unavailable.');
  const client=await createClient();
  const {data:{user},error}=await client.auth.getUser();
  if(error||!user?.id||user.is_anonymous||!user.email_confirmed_at)throw Error('Access denied.');
  return client;
}
function validOffer(o:PublishedOffer){
  return o&&uuid.test(o.plan_id)&&integer(o.version,1)&&/^[a-f0-9]{64}$/.test(o.digest)&&code(o.code)&&typeof o.display_name==='string'&&
    integer(o.amount_minor)&&o.currency==='INR'&&o.billing_period==='month'&&integer(o.setup_min_minor)&&integer(o.setup_max_minor,o.setup_min_minor)&&
    typeof o.setup_optional==='boolean'&&['inclusive','exclusive'].includes(o.tax_treatment)&&integer(o.named_users,1)&&integer(o.lead_records,1);
}
function validRequest(r:ChangeRequest){
  return r&&uuid.test(r.id)&&['requested','withdrawn','activated','superseded'].includes(r.status)&&['customer','admin'].includes(r.request_origin)&&code(r.target_code)&&integer(r.target_version,1)&&integer(r.amount_minor)&&r.currency==='INR'&&date(r.requested_at)&&(r.withdrawn_at===null||date(r.withdrawn_at));
}
export async function loadChangeOptions():Promise<ChangeOptions>{
  const client=await session();
  const {data,error}=await client.rpc('get_current_plan_change_options_v1');
  if(error||!data||!Array.isArray(data.requests)||data.requests.length>50||!data.requests.every(validRequest))throw Error('Plan changes unavailable.');
  if(data.state==='unavailable')return {state:'unavailable',requests:data.requests};
  if(data.state!=='available'||!date(data.subscription_revision)||!Array.isArray(data.offers)||data.offers.length>4||!data.offers.every(validOffer))throw Error('Plan changes unavailable.');
  return {state:'available',subscription_revision:data.subscription_revision,offers:data.offers,requests:data.requests};
}
export async function requestPlanChange(key:string,target:string,version:number,digest:string,revision:string){
  if(!uuid.test(key)||!uuid.test(target)||!integer(version,1)||! /^[a-f0-9]{64}$/.test(digest)||!date(revision))throw Error('Invalid offer.');
  const client=await session();
  const {data,error}=await client.rpc('request_current_plan_change_v1',{p_idempotency_key:key,p_target_plan:target,p_target_version:version,p_target_digest:digest,p_expected_subscription_updated_at:revision});
  if(error||typeof data!=='string'||!uuid.test(data))throw Error('Request unavailable. Refresh and check current terms.');
  return data;
}
export async function withdrawPlanChange(id:string){
  if(!uuid.test(id))throw Error('Invalid request.');
  const client=await session();
  const {data,error}=await client.rpc('withdraw_current_plan_change_v1',{p_request:id});
  if(error||data!==true)throw Error('Request could not be withdrawn.');
}
