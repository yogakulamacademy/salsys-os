import {notFound} from 'next/navigation';
import Link from 'next/link';
import {loadManualPilot,type ManualQueue} from '@/lib/commercial/manual-pilot';
import {approvePilotAction,activatePilotAction} from './actions';
export const dynamic='force-dynamic';
export const metadata={title:'Manual subscription approvals',robots:{index:false,follow:false,nocache:true}};
const money=(n:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(n/100);
export default async function ManualPilotPage({searchParams}:{searchParams:Promise<{result?:string}>}){
  let state:ManualQueue;try{state=await loadManualPilot();}catch{notFound();}
  const result=(await searchParams).result;
  const activationEnabled=process.env.SALSYS_MANUAL_ACTIVATION_ENABLED==='true';
  return <main className="space-y-4">
    <Link href="/settings/commercial-plans" className="text-sm underline">Commercial plans</Link>
    <h1 className="text-2xl font-semibold">Manual subscription approvals</h1>
    <section className="rounded-xl border border-line p-4">
      <p className="font-semibold">{state.used_slots} / {state.max_slots} organizations admitted to manual pilot</p>
      <progress className="w-full" max={10} value={state.used_slots} aria-label="Manual pilot capacity"/>
      <p className="text-sm">Free registration is separate. No gateway or recurring charge is required. {activationEnabled?'Approval activates the exact approved plan.':'Approvals are recorded here; activation is disabled.'}</p>
    </section>
    {result==='error'?<p role="alert">Approval not recorded. Check eligibility, capacity and terms.</p>:result==='approved'?<p role="status">Manual approval recorded. Access has not changed.</p>:result==='activated'?<p role="status">Subscription activated. No automatic charge.</p>:null}
    {state.requests.length===0?<p>No eligible plan requests.</p>:state.requests.map(r=><article key={r.id} className="space-y-3 rounded-xl border border-line p-4">
      <h2 className="font-semibold">{r.organization_name} · {r.plan_code} v{r.version}</h2>
      <p className="text-sm">Published monthly price: {money(r.amount_minor)}. Requested {new Date(r.requested_at).toISOString().slice(0,10)} UTC.</p>
      {r.approved_at?<div className="space-y-2"><p className="text-sm">Approval recorded ({r.approval_mode?.replaceAll('_',' ')}). Pending activation.</p>{activationEnabled&&<form action={activatePilotAction} className="space-y-2"><input type="hidden" name="request" value={r.id}/><input type="hidden" name="digest" value={r.digest}/><label className="grid gap-1 text-sm">Type ACTIVATE PILOT to confirm<input name="confirmation" required autoComplete="off" className="rounded border border-line p-2"/></label><button type="submit" className="rounded border border-line p-2 font-semibold">Activate approved subscription</button></form>}</div>:<form action={approvePilotAction} className="grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="request" value={r.id}/><input type="hidden" name="digest" value={r.digest}/>
        <label className="grid gap-1 text-sm">Approval type<select name="mode" required className="rounded border border-line p-2">{r.plan_code==='free'?<option value="free">Free forever</option>:<><option value="offline_confirmation">Offline payment confirmed by admin</option><option value="complimentary">Complimentary pilot access</option></>}</select></label>
        <label className="grid gap-1 text-sm">Offline reference (only if paid offline)<input name="reference" maxLength={256} className="rounded border border-line p-2"/></label>
        <label className="grid gap-1 text-sm">Access ends (UTC, leave blank for Free)<input name="ends_at" type="datetime-local" required={r.plan_code!=='free'} className="rounded border border-line p-2"/></label>
        <label className="grid gap-1 text-sm">Approval reason<textarea name="reason" required minLength={10} maxLength={2048} className="rounded border border-line p-2"/></label>
        <label className="grid gap-1 text-sm">Type APPROVE PILOT to confirm<input name="confirmation" required autoComplete="off" className="rounded border border-line p-2"/></label>
        <button type="submit" className="rounded border border-line p-2 font-semibold">{activationEnabled?'Approve and activate':'Record manual approval'}</button>
      </form>}
    </article>)}
  </main>;
}
