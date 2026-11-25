// Presentation-only contract for a future authorized lifecycle read endpoint.
// No data access, writes, request submission or permission grants here.
export type LifecycleStatus='active'|'suspended'|'archived';
export type LifecycleAction='suspend'|'restore';
export type LifecycleEvent={revision:number;action:LifecycleAction;previousStatus:'active'|'suspended';newStatus:'active'|'suspended';reason:string;occurredAt:string};
export type LifecycleView=
  | {state:'unavailable'}
  | {state:'available';organizationId:string;status:LifecycleStatus;revision:number;action:LifecycleAction|null;events:LifecycleEvent[]};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validRevision=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
function event(value:unknown):LifecycleEvent|null{
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const r=value as Record<string,unknown>;
  if(!validRevision(r.revision)||r.revision===0||typeof r.reason!=='string'||r.reason.trim().length<10||r.reason.trim().length>512||
     typeof r.occurred_at!=='string'||!Number.isFinite(Date.parse(r.occurred_at)))return null;
  if(r.action==='suspend'&&r.previous_status==='active'&&r.new_status==='suspended')
    return {revision:r.revision,action:'suspend',previousStatus:'active',newStatus:'suspended',reason:r.reason.trim(),occurredAt:r.occurred_at};
  if(r.action==='restore'&&r.previous_status==='suspended'&&r.new_status==='active')
    return {revision:r.revision,action:'restore',previousStatus:'suspended',newStatus:'active',reason:r.reason.trim(),occurredAt:r.occurred_at};
  return null;
}
export function parseLifecyclePreview(value:unknown,expectedOrganizationId:string,platformOrganizationId:string):LifecycleView{
  if(!uuid.test(expectedOrganizationId)||!uuid.test(platformOrganizationId)||!value||typeof value!=='object'||Array.isArray(value))return {state:'unavailable'};
  const r=value as Record<string,unknown>;
  if(expectedOrganizationId.toLowerCase()===platformOrganizationId.toLowerCase()||r.organization_id!==expectedOrganizationId||r.state!=='available'||
    (r.status!=='active'&&r.status!=='suspended'&&r.status!=='archived')||!validRevision(r.revision)||
    typeof r.may_suspend!=='boolean'||typeof r.may_restore!=='boolean'||!Array.isArray(r.events)||r.events.length>20)return {state:'unavailable'};
  const events:LifecycleEvent[]=[];
  for(const raw of r.events){const e=event(raw);if(!e)return {state:'unavailable'};events.push(e);}
  // Latest bounded history must match current revision and recorded status.
  if(events.length!==Math.min(r.revision,20))return {state:'unavailable'};
  if(events.length&&(events[0].revision!==r.revision||events[0].newStatus!==r.status))return {state:'unavailable'};
  for(let i=1;i<events.length;i++){if(events[i].revision!==events[i-1].revision-1||events[i].newStatus!==events[i-1].previousStatus)return {state:'unavailable'};}
  const action=r.status==='active'&&r.may_suspend?'suspend':r.status==='suspended'&&r.may_restore?'restore':null;
  return {state:'available',organizationId:expectedOrganizationId,status:r.status,revision:r.revision,action,events};
}
export function lifecycleConfirmationReady(action:LifecycleAction,reason:string,confirmation:string):boolean{
  return (action==='suspend'||action==='restore')&&reason.trim().length>=10&&reason.trim().length<=512&&confirmation===action.toUpperCase();
}
