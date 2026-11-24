import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePlanAdminActor } from '@/lib/commercial/plan-admin';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type ManualMode='free'|'offline_confirmation'|'complimentary';
export type ManualRequest={id:string;organization_name:string;plan_code:'free'|'basic'|'growth'|'pro';version:number;amount_minor:number;digest:string;requested_at:string;approved_at:string|null;approval_mode:ManualMode|null;access_ends_at:string|null};
export type ManualQueue={used_slots:number;max_slots:10;requests:ManualRequest[]};
function enabled(){if(process.env.SALSYS_MANUAL_PILOT_ENABLED!=='true')throw Error('Manual approval unavailable.');}
export async function loadManualPilot():Promise<ManualQueue>{
  enabled();
  const actor=await requirePlanAdminActor();
  const {data,error}=await createAdminClient().rpc('commercial_list_manual_pilot_v1',{p_actor:actor});
  if(error||!data||data.max_slots!==10||!Number.isInteger(data.used_slots)||data.used_slots<0||data.used_slots>10||
    !Array.isArray(data.requests)||data.requests.length>100||!data.requests.every((r:ManualRequest)=>r&&uuid.test(r.id)&&typeof r.organization_name==='string'&&['free','basic','growth','pro'].includes(r.plan_code)&&Number.isInteger(r.version)&&r.version>0&&Number.isSafeInteger(r.amount_minor)&&r.amount_minor>=0&&/^[a-f0-9]{64}$/.test(r.digest)))throw Error('Manual queue unavailable.');
  return data;
}
export async function approveManualPilot(input:{request:string;digest:string;mode:ManualMode;reference:string|null;reason:string;endsAt:string|null}){
  enabled();
  if(!uuid.test(input.request)||! /^[a-f0-9]{64}$/.test(input.digest)||!['free','offline_confirmation','complimentary'].includes(input.mode)
    ||input.reason.trim().length<10||input.reason.length>2048
    ||(input.mode==='offline_confirmation'&&(!input.reference||input.reference.length>256||input.reference.trim().length<3))
    ||(input.mode!=='offline_confirmation'&&input.reference!==null)
    ||(input.mode==='free'?input.endsAt!==null:!input.endsAt||!Number.isFinite(Date.parse(input.endsAt))))throw Error('Invalid approval terms.');
  const actor=await requirePlanAdminActor();
  const activate=process.env.SALSYS_MANUAL_ACTIVATION_ENABLED==='true';
  const {data,error}=await createAdminClient().rpc(activate?'commercial_approve_activate_manual_pilot_v1':'commercial_approve_manual_pilot_v1',{
    p_actor:actor,p_request:input.request,p_digest:input.digest,p_mode:input.mode,
    p_reference:input.reference,p_reason:input.reason,p_ends_at:input.endsAt,
  });
  if(error||typeof data!=='string'||(activate?!uuid.test(data):data!==input.request))throw Error('Approval not completed. Check current request and pilot capacity.');
  return activate?'activated':'approved';
}

export async function activateApprovedPilot(request:string,digest:string){
  enabled();
  if(process.env.SALSYS_MANUAL_ACTIVATION_ENABLED!=='true'||!uuid.test(request)||! /^[a-f0-9]{64}$/.test(digest))throw Error('Activation unavailable.');
  const actor=await requirePlanAdminActor();
  const {data,error}=await createAdminClient().rpc('commercial_activate_manual_pilot_v1',{p_actor:actor,p_request:request,p_digest:digest});
  if(error||typeof data!=='string'||!uuid.test(data))throw Error('Activation not completed.');
}
