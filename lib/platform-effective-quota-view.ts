// Pure presentation contract for a future approved read-only platform quota endpoint.
// Do not fetch private counters or infer effective usage from registry/catalog data.
export type EffectiveQuotaView =
  | { state:'unavailable' }
  | { state:'managed_separately' }
  | { state:'organization_inactive' }
  | { state:'pro_trial'|'free'|'free_pending_reconciliation'|'manual_active'; planCode:'free'|'basic'|'growth'|'pro'; users:QuotaMetric; leads:QuotaMetric };
export type QuotaMetric = { used:number; limit:number; remaining:number; overLimit:boolean; atLimit:boolean };
const states=['pro_trial','free','free_pending_reconciliation','manual_active'] as const;
const codes=['free','basic','growth','pro'] as const;
function integer(value:unknown,min:number):value is number {
  return typeof value==='number'&&Number.isSafeInteger(value)&&value>=min;
}
function metric(used:unknown,limit:unknown,over:unknown):QuotaMetric|null {
  if(!integer(used,0)||!integer(limit,1)||typeof over!=='boolean'||over!==(used>limit))return null;
  return {used,limit,remaining:Math.max(0,limit-used),overLimit:over,atLimit:used===limit};
}
export function parseEffectiveQuotaPreview(value:unknown):EffectiveQuotaView {
  if(!value||typeof value!=='object'||Array.isArray(value))return {state:'unavailable'};
  const r=value as Record<string,unknown>;
  if(r.state==='managed_separately'||r.state==='organization_inactive'||r.state==='unavailable')return {state:r.state};
  if(!states.includes(r.state as typeof states[number])||!codes.includes(r.plan_code as typeof codes[number]))return {state:'unavailable'};
  const state=r.state as typeof states[number],planCode=r.plan_code as typeof codes[number];
  if((state==='pro_trial'&&planCode!=='pro')||((state==='free'||state==='free_pending_reconciliation')&&planCode!=='free'))return {state:'unavailable'};
  const users=metric(r.named_users,r.named_user_limit,r.named_users_over_limit);
  const leads=metric(r.lead_records,r.lead_record_limit,r.lead_records_over_limit);
  if(!users||!leads)return {state:'unavailable'};
  return {state,planCode,users,leads};
}
