import { randomUUID } from 'node:crypto';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireAdminWorkspaceAccess } from '@/lib/route-access';
import { loadChangeOptions, type ChangeOptions } from '@/lib/commercial/plan-change';
import { requestChangeAction, withdrawChangeAction } from './actions';

export const dynamic='force-dynamic';
export const metadata={title:'Plan change requests',robots:{index:false,follow:false,nocache:true}};
const money=(minor:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(minor/100);
export default async function PlanChangesPage({searchParams}:{searchParams:Promise<{result?:string}>}){
  if(process.env.SALSYS_PLAN_CHANGE_REQUESTS_ENABLED!=='true')notFound();
  const workspace=await requireAdminWorkspaceAccess();
  if(workspace.role!=='owner')notFound();
  let state:ChangeOptions;
  try{state=await loadChangeOptions();}catch{notFound();}
  const result=(await searchParams).result;
  const pending=state.requests.some(r=>r.status==='requested');
  return <main className="space-y-5">
    <header><h1 className="text-2xl font-semibold">Plan change requests</h1><p className="mt-2 text-sm">Review published offers. Requesting a change does not charge you, renew your subscription or change your access.</p></header>
    {result==='error'?<p role="alert">Request not completed. Refresh and verify current terms.</p>:result==='requested'?<p role="status">Request recorded. Your subscription is unchanged.</p>:result==='withdrawn'?<p role="status">Request withdrawn.</p>:null}
    {process.env.SALSYS_CONTRACT_QUOTES_ENABLED==='true'&&<Link href="/settings/subscription/changes/quotes" className="text-sm underline">Review subscription quotes</Link>}
    {state.state==='available'?<section className="grid gap-3 md:grid-cols-2">
      {state.offers.length===0?<p>No other published offers available.</p>:state.offers.map(o=><article key={o.plan_id} className="space-y-3 rounded-xl border border-line p-4">
        <h2 className="font-semibold">{o.display_name} · version {o.version}</h2>
        <p className="text-xl font-semibold">{money(o.amount_minor)} / month</p>
        <p className="text-sm">Taxes {o.tax_treatment}. Setup fee {money(o.setup_min_minor)}–{money(o.setup_max_minor)} ({o.setup_optional?'optional':'required'}).</p>
        <p className="text-sm">{o.named_users.toLocaleString('en-IN')} active users · {o.lead_records.toLocaleString('en-IN')} retained lead records</p>
        {pending?<p className="text-sm">Withdraw the existing request before requesting another.</p>:<form action={requestChangeAction} className="space-y-3">
          <input type="hidden" name="key" value={randomUUID()}/><input type="hidden" name="target" value={o.plan_id}/><input type="hidden" name="version" value={o.version}/><input type="hidden" name="digest" value={o.digest}/><input type="hidden" name="revision" value={state.subscription_revision}/>
          <label className="flex gap-2 text-sm"><input type="checkbox" name="confirm" value="request_only" required/>I understand this is a non-binding request, not a purchase or immediate change.</label>
          <button type="submit" className="rounded-lg border border-line px-3 py-2 font-semibold">Request plan change</button>
        </form>}
      </article>)}
    </section>:<p>New plan change requests are not available for this workspace.</p>}
    <section className="space-y-3"><h2 className="text-lg font-semibold">Request history</h2>
      {!state.requests.length?<p>No requests recorded.</p>:state.requests.map(r=><article key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-4">
        <div><p className="font-semibold capitalize">{r.target_code} · version {r.target_version} · {r.request_origin==='admin'?'Admin assignment':'Your request'}</p><p className="text-sm">{money(r.amount_minor)}/month · {r.status} · {new Date(r.requested_at).toISOString().slice(0,10)} UTC</p></div>
        {r.status==='requested'&&<form action={withdrawChangeAction}><input type="hidden" name="id" value={r.id}/><button className="rounded border border-line px-3 py-2" type="submit">Withdraw request</button></form>}
      </article>)}
    </section>
  </main>;
}
