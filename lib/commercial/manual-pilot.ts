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

type AssignmentOrg={id:string;organization_name:string;revision:string;current_code:string;requested_code:string|null;pending_request_id:string|null;pilot_enabled:boolean};
type AssignmentOffer={id:string;code:'free'|'basic'|'growth'|'pro';version:number;digest:string;amount_minor:number};
export type AssignmentState={organizations:AssignmentOrg[];offers:AssignmentOffer[]};
function assignmentEnabled(){
  enabled();
  if(process.env.SALSYS_MANUAL_ACTIVATION_ENABLED!=='true')throw Error('Assignment unavailable.');
}
export async function loadManualAssignments():Promise<AssignmentState>{
  assignmentEnabled();
  const actor=await requirePlanAdminActor();
  const {data,error}=await createAdminClient().rpc('commercial_list_manual_assignments_v1',{p_actor:actor});
  if(error||!data||!Array.isArray(data.organizations)||data.organizations.length>100||!Array.isArray(data.offers)||data.offers.length>4||
    !data.organizations.every((r:AssignmentOrg)=>r&&uuid.test(r.id)&&typeof r.organization_name==='string'&&Number.isFinite(Date.parse(r.revision))&&typeof r.pilot_enabled==='boolean'&&['free','basic','growth','pro'].includes(r.current_code))||
    !data.offers.every((r:AssignmentOffer)=>r&&uuid.test(r.id)&&['free','basic','growth','pro'].includes(r.code)&&Number.isInteger(r.version)&&r.version>0&&/^[a-f0-9]{64}$/.test(r.digest)&&Number.isSafeInteger(r.amount_minor)&&r.amount_minor>=0))throw Error('Assignment list unavailable.');
  return data;
}
export async function assignManualPlan(input:{org:string;revision:string;plan:string;version:number;digest:string;key:string;mode:ManualMode;reference:string|null;reason:string;endsAt:string|null}){
  assignmentEnabled();
  if(!uuid.test(input.org)||!uuid.test(input.plan)||!uuid.test(input.key)||!Number.isFinite(Date.parse(input.revision))||!Number.isInteger(input.version)||input.version<1||! /^[a-f0-9]{64}$/.test(input.digest)||
    !['free','complimentary','offline_confirmation'].includes(input.mode)||input.reason.trim().length<10||input.reason.length>2048||
    (input.mode==='offline_confirmation'?(!input.reference||input.reference.trim().length<3||input.reference.length>256):input.reference!==null)||
    (input.mode==='free'?input.endsAt!==null:!input.endsAt||!Number.isFinite(Date.parse(input.endsAt))))throw Error('Invalid assignment.');
  const actor=await requirePlanAdminActor();
  const {data,error}=await createAdminClient().rpc('commercial_assign_manual_plan_v1',{p_actor:actor,p_org:input.org,p_expected:input.revision,p_plan:input.plan,p_version:input.version,p_digest:input.digest,p_key:input.key,p_mode:input.mode,p_reference:input.reference,p_reason:input.reason,p_ends_at:input.endsAt});
  if(error||typeof data!=='string'||!uuid.test(data))throw Error('Assignment not completed.');
}

export async function enablePilotRequests(org:string,reason:string){
  assignmentEnabled();
  if(!uuid.test(org)||reason.trim().length<10||reason.length>512)throw Error('Invalid enrollment.');
  const actor=await requirePlanAdminActor();
  const {data,error}=await createAdminClient().rpc('commercial_enable_manual_pilot_requests_v1',{p_actor:actor,p_org:org,p_reason:reason});
  if(error||data!==true)throw Error('Enrollment unavailable.');
}

export type ManualLaunchReadiness={database_configuration_ready:boolean;missing_plan_codes:string[];blockers:string[];trial_days:30;pilot_capacity:10;pilot_used:number};
const readinessBlockers=['missing_published_plans','missing_trial_policy','free_policy_mismatch','pro_policy_mismatch','trial_policy_disabled','trial_policy_not_effective','inactive_workspace_scope'];
export async function loadManualLaunchReadiness():Promise<ManualLaunchReadiness>{
  enabled();
  const actor=await requirePlanAdminActor();
  const {data,error}=await createAdminClient().rpc('commercial_manual_launch_readiness_v1',{p_actor:actor});
  if(error||!data||typeof data.database_configuration_ready!=='boolean'||data.trial_days!==30||data.pilot_capacity!==10||
    !Number.isInteger(data.pilot_used)||data.pilot_used<0||data.pilot_used>10||
    !Array.isArray(data.missing_plan_codes)||data.missing_plan_codes.length>4||!data.missing_plan_codes.every((x:unknown)=>typeof x==='string'&&['free','basic','growth','pro'].includes(x))||
    !Array.isArray(data.blockers)||!data.blockers.every((x:unknown)=>typeof x==='string'&&readinessBlockers.includes(x))||
    data.database_configuration_ready!==(data.blockers.length===0))throw Error('Launch readiness unavailable.');
  return data;
}
