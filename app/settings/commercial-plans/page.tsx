import { PlatformAdminFrame } from '@/components/platform-admin-frame';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { readPlanReviewState, PLAN_CODES, type PlanReviewState } from '@/lib/commercial/plan-admin';
import { createPlanAction, transitionPlanAction, publishInitialPlanAction } from './actions';

export const dynamic='force-dynamic';
export const metadata={title:'Commercial plan proposals',robots:{index:false,follow:false,nocache:true}};
const inputClass='w-full rounded-lg border border-line bg-surface p-2 text-sm';
function Field({name,label,type='text',min,max,defaultValue}: {name:string;label:string;type?:string;min?:number;max?:number;defaultValue?:string|number}) {
  return <label className="grid gap-1 text-sm">{label}<input required name={name} type={type} min={min} max={max} step={type==='number'?1:undefined} defaultValue={defaultValue} className={inputClass}/></label>;
}
export default async function CommercialPlansPage({searchParams}:{searchParams:Promise<{result?:string}>}) {
  let state:PlanReviewState;
  try { state=await readPlanReviewState(); } catch { notFound(); }
  const result=(await searchParams).result;
  return <PlatformAdminFrame section="plans"><main className="mx-auto max-w-6xl space-y-6 p-6">
    <header><h1 className="text-2xl font-bold">Commercial plan proposals</h1>
    <p className="mt-2 text-sm">Internal plan administration. Initial publication requires separate approval and authorization. No customer subscription change or charge is possible here.</p></header>
    {result==='error'?<p role="alert" className="rounded border border-line p-3 text-sm">Operation not completed. Check permissions, approval, and catalog version, then retry.</p>:['created','review_saved','published'].includes(result??'')?<p role="status" className="rounded border border-line p-3 text-sm">{result==='published'?'Initial catalog plan published. Customer subscriptions remain unchanged.':result==='created'?'Draft proposal saved.':'Review decision saved.'}</p>:null}
    {process.env.SALSYS_PLATFORM_ADMIN_ENABLED==='true'&&<Link href="/platform-admin" className="block text-sm underline">Platform administration overview</Link>}
    {process.env.SALSYS_MANUAL_PILOT_ENABLED==='true'&&<Link href="/settings/commercial-plans/pilot" className="text-sm underline">Manual subscription approvals</Link>}
    {process.env.SALSYS_CONTRACT_QUOTES_ENABLED==='true'&&<Link href="/settings/commercial-plans/quotes" className="text-sm underline">Subscription quote queue (authorized operators)</Link>}
    <section className="grid gap-3 sm:grid-cols-4" aria-label="Current catalog versions">
      {PLAN_CODES.map(code=><div key={code} className="rounded-xl border border-line p-4"><h2 className="font-semibold capitalize">{code}</h2><p className="text-sm">Catalog version: {state.versions[code]??'Not created'}</p></div>)}
    </section>
    {state.may_author&&<section className="rounded-xl border border-line p-5">
      <h2 className="mb-4 text-lg font-semibold">New immutable proposal</h2>
      <form action={createPlanAction} className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">Plan<select name="code" required className={inputClass}>{PLAN_CODES.map(code=><option key={code} value={code}>{code}</option>)}</select></label>
        <Field name="expected_version" label="Expected catalog version (0 for new)" type="number" min={0} max={2147483647} defaultValue={0}/>
        <Field name="display_name" label="Display name"/>
        <Field name="amount_minor" label="Monthly price (INR paise)" type="number" min={0} max={1000000000}/>
        <Field name="setup_min_minor" label="Minimum setup fee (paise)" type="number" min={0} max={1000000000}/>
        <Field name="setup_max_minor" label="Maximum setup fee (paise)" type="number" min={0} max={1000000000}/>
        <label className="grid gap-1 text-sm">Setup optional<select name="setup_optional" className={inputClass}><option value="true">Yes</option><option value="false">No</option></select></label>
        <label className="grid gap-1 text-sm">Tax treatment<select name="tax_treatment" className={inputClass}><option value="exclusive">Exclusive</option><option value="inclusive">Inclusive</option></select></label>
        <Field name="named_users" label="Active named users" type="number" min={1} max={1000000}/>
        <Field name="lead_records" label="Retained lead records" type="number" min={1} max={100000000}/>
        <Field name="workspace_codes" label="Workspace codes (comma-separated)" defaultValue="admin,sales"/>
        <label className="grid gap-1 text-sm">Integration codes (optional, comma-separated)<input name="integration_codes" className={inputClass}/></label>
        <label className="grid gap-1 text-sm sm:col-span-2">Rationale<textarea name="rationale" required minLength={10} maxLength={2048} className={inputClass}/></label>
        <button className="rounded-lg border border-line px-4 py-2 text-sm font-semibold" type="submit">Save draft proposal</button>
      </form>
    </section>}
    <section className="space-y-3"><h2 className="text-lg font-semibold">Recent proposals (up to 100)</h2>
      {!state.requests.length&&<p>No proposals recorded.</p>}
      {state.requests.map(r=><article key={r.id} className="space-y-3 rounded-xl border border-line p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{r.snapshot.display_name} · {r.plan_code}</h3><span className="text-sm">{state.published_request_ids.includes(r.id)?'published':r.status.replaceAll('_',' ')} · revision {r.revision}</span></div>
        <p className="text-sm">Base version {r.expected_plan_version} · proposed INR {(r.snapshot.amount_minor/100).toFixed(2)}/month</p>
        <p className="text-sm">{r.rationale}</p>
        <details><summary className="cursor-pointer text-sm">Exact proposal and digest</summary><pre className="overflow-x-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(r.snapshot,null,2)}</pre><p className="break-all text-xs">{r.snapshot_sha256}</p></details>
        {((r.status==='draft'&&state.may_author&&r.author_user_id===state.actorId)||(r.status==='under_review'&&state.may_review&&r.author_user_id!==state.actorId))&&
          <form action={transitionPlanAction} className="space-y-2">
            <input type="hidden" name="id" value={r.id}/><input type="hidden" name="revision" value={r.revision}/><input type="hidden" name="digest" value={r.snapshot_sha256}/>
            <label className="grid gap-1 text-sm">Decision rationale<textarea required name="reason" maxLength={2048} className={inputClass}/></label>
            {r.status==='draft'?<button type="submit" name="action" value="submit" className="rounded border border-line p-2">Submit for review</button>:
              <div className="flex flex-wrap gap-2"><button type="submit" name="action" value="review" className="rounded border border-line p-2">Approve for design only</button><button type="submit" name="action" value="reject" className="rounded border border-line p-2">Reject</button></div>}
          </form>}
        {state.publicationEnabled&&state.may_publish&&state.authorized_request_ids.includes(r.id)&&!state.published_request_ids.includes(r.id)&&
          <form action={publishInitialPlanAction} className="space-y-2 rounded-lg border border-line p-3">
            <p className="text-sm font-semibold">Initial catalog publication authorized</p>
            <p className="text-sm">Creates version 1 of this plan and its immutable price record. Does not assign a customer or enable an integration.</p>
            <input type="hidden" name="id" value={r.id}/><input type="hidden" name="revision" value={r.revision}/><input type="hidden" name="digest" value={r.snapshot_sha256}/>
            <label className="grid gap-1 text-sm">Type PUBLISH INITIAL PLAN to confirm<input name="confirmation" required autoComplete="off" className={inputClass}/></label>
            <button type="submit" className="rounded border border-line p-2 font-semibold">Publish initial plan</button>
          </form>}
      </article>)}
    </section>
  </main></PlatformAdminFrame>;
}
