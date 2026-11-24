import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { useMockData } from '@/lib/config';

type HistoryEntry = {
  event_type: string; previous_status: string|null; new_status: string|null;
  occurred_at: string; plan_code: string|null;
};
export type SubscriptionDashboard =
  | { state:'unavailable'|'managed_separately' }
  | { state:'pro_trial'|'free_pending_reconciliation'|'free'; plan_code:'pro'|'free';
      trial_ends_at:string; remaining_seconds:number; named_users:number; named_user_limit:number;
      lead_records:number; lead_record_limit:number; history:HistoryEntry[] };

const statuses=new Set(['trialing','active','past_due','canceled','expired']);
const events=new Set(['subscription_created','subscription_status_changed','subscription_plan_changed','subscription_terms_changed']);
function validInteger(x:unknown,min=0):x is number {
  return typeof x==='number' && Number.isSafeInteger(x) && x>=min;
}
function validDate(x:unknown):x is string {
  return typeof x==='string' && Number.isFinite(Date.parse(x));
}
function validHistory(x:unknown):x is HistoryEntry {
  if(!x||typeof x!=='object'||Array.isArray(x))return false;
  const row=x as Record<string,unknown>;
  return typeof row.event_type==='string' && events.has(row.event_type)
    && (row.previous_status===null || (typeof row.previous_status==='string'&&statuses.has(row.previous_status)))
    && (row.new_status===null || (typeof row.new_status==='string'&&statuses.has(row.new_status)))
    && (row.plan_code===null || (typeof row.plan_code==='string'&&/^[a-z][a-z0-9_]{1,63}$/.test(row.plan_code)))
    && validDate(row.occurred_at);
}

export async function loadSubscriptionDashboard():Promise<SubscriptionDashboard> {
  if(useMockData||process.env.SALSYS_COMMERCIAL_ACCESS_ENABLED!=='true')return {state:'unavailable'};
  try{
    const session=await createClient();
    const {data:{user},error:authError}=await session.auth.getUser();
    if(authError||!user?.id||user.is_anonymous||!user.email_confirmed_at)return {state:'unavailable'};
    const {data,error}=await session.rpc('get_current_subscription_dashboard_v1');
    if(error||!data||typeof data!=='object'||Array.isArray(data))return {state:'unavailable'};
    if(data.state==='managed_separately')return {state:'managed_separately'};
    if(!['pro_trial','free_pending_reconciliation','free'].includes(data.state)
      ||data.plan_code!==(data.state==='pro_trial'?'pro':'free')
      ||!validDate(data.trial_ends_at)||!validInteger(data.remaining_seconds)
      ||!validInteger(data.named_users)||!validInteger(data.named_user_limit,1)
      ||!validInteger(data.lead_records)||!validInteger(data.lead_record_limit,1)
      ||!Array.isArray(data.history)||data.history.length>50||!data.history.every(validHistory))return {state:'unavailable'};
    // Explicit projection: never spread raw RPC responses into customer views.
    return {state:data.state,plan_code:data.plan_code,trial_ends_at:data.trial_ends_at,
      remaining_seconds:data.remaining_seconds,named_users:data.named_users,named_user_limit:data.named_user_limit,
      lead_records:data.lead_records,lead_record_limit:data.lead_record_limit,
      history:data.history.map((row:HistoryEntry)=>({event_type:row.event_type,previous_status:row.previous_status,
        new_status:row.new_status,occurred_at:row.occurred_at,plan_code:row.plan_code}))};
  }catch{return {state:'unavailable'};}
}
