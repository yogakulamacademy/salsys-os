import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/ui';
import { requireAdminWorkspaceAccess } from '@/lib/route-access';
import { loadSubscriptionDashboard } from '@/lib/commercial/subscription-dashboard';
import { useMockData } from '@/lib/config';

export const dynamic='force-dynamic';
export const metadata={title:'Subscription & Billing',robots:{index:false,follow:false,nocache:true}};
const count=(n:number)=>n.toLocaleString('en-IN');
const date=(s:string)=>new Date(s).toISOString().replace('T',' ').slice(0,16)+' UTC';
const title=(s:string)=>s.replaceAll('_',' ').replace(/^./,c=>c.toUpperCase());
function Usage({label,used,limit}:{label:string;used:number;limit:number}) {
  return <section className="rounded-xl border border-line bg-surface p-4">
    <h2 className="text-sm font-semibold">{label}</h2>
    <p className="mt-2 text-xl font-semibold">{count(used)} / {count(limit)}</p>
    <progress className="mt-2 h-2 w-full" aria-label={label} max={limit} value={Math.min(used,limit)}/>
    <p className="mt-2 text-sm">{used>limit?'Over limit. Existing records remain; additional usage is restricted.':used===limit?'Limit reached. Additional usage is restricted.':count(limit-used)+' remaining'}</p>
  </section>;
}
export default async function SubscriptionPage(){
  if(useMockData||process.env.SALSYS_COMMERCIAL_ACCESS_ENABLED!=='true')notFound();
  await requireAdminWorkspaceAccess();
  const data=await loadSubscriptionDashboard();
  return <main className="space-y-4">
    <PageHeader eyebrow="Account" title="Subscription & Billing" description="View your current subscription, usage and plan history."/>
    {!("plan_code" in data)?<section className="rounded-xl border border-line p-4"><h2 className="font-semibold">{data.state==='managed_separately'?'Managed subscription':'Subscription information unavailable'}</h2>
      <p className="mt-2 text-sm">{data.state==='managed_separately'?'Your workspace is managed separately. No self-service terms are inferred.':'Current subscription information could not be verified. Please refresh or contact support.'}</p></section>:
      <>
        <section className="rounded-xl border border-line bg-surface p-5">
          <p className="text-sm">Current plan</p>
          <h2 className="mt-1 text-2xl font-semibold">{data.state==='pro_trial'?'Pro trial':'Free'}</h2>
          {data.state==='pro_trial'?<p className="mt-2 text-sm">{Math.ceil(data.remaining_seconds/3600)} hours remaining. Trial ends {date(data.trial_ends_at)}. Continue on Free afterward without automatic charges.</p>:<p className="mt-2 text-sm">Your Free plan has no subscription expiry. Existing records are preserved.{data.state==='free_pending_reconciliation'?' Your trial has ended; account reconciliation is pending.':''}</p>}
        </section>
        <div className="grid gap-3 md:grid-cols-2"><Usage label="Active named users" used={data.named_users} limit={data.named_user_limit}/><Usage label="Retained lead records" used={data.lead_records} limit={data.lead_record_limit}/></div>
        <section className="rounded-xl border border-line p-4"><h2 className="font-semibold">Plan upgrades</h2><p className="mt-2 text-sm">Self-service paid upgrades are not yet available. No payment or automatic renewal is initiated here.</p></section>
        <section className="rounded-xl border border-line p-4"><h2 className="font-semibold">Subscription history</h2>
          {data.history.length===0?<p className="mt-2 text-sm">No recorded subscription events.</p>:<div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th scope="col" className="p-2">Date</th><th scope="col" className="p-2">Event</th><th scope="col" className="p-2">Plan</th><th scope="col" className="p-2">Status</th></tr></thead><tbody>{data.history.map((e,i)=><tr key={i} className="border-t border-line"><td className="p-2 whitespace-nowrap">{date(e.occurred_at)}</td><td className="p-2">{title(e.event_type)}</td><td className="p-2 capitalize">{e.plan_code??'Not recorded'}</td><td className="p-2">{e.previous_status?title(e.previous_status)+' → ':''}{e.new_status?title(e.new_status):'Not recorded'}</td></tr>)}</tbody></table></div>}
          <p className="mt-3 text-xs">Showing up to 50 recorded subscription events. These are not invoices or payment records.</p>
        </section>
      </>}
    <section className="rounded-xl border border-line p-4"><h2 className="font-semibold">Billing and invoices</h2><p className="mt-2 text-sm">Payment management and SaaS invoices are not available yet.</p></section>
  </main>;
}
