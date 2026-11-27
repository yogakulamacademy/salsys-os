import { PageFeedback } from '@/components/page-feedback';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireAdminWorkspaceAccess } from '@/lib/route-access';
import { loadCustomerQuotes,type CustomerQuote } from '@/lib/commercial/contract-quotes';
import { acceptQuoteAction } from './actions';
export const dynamic='force-dynamic';
export const metadata={title:'Subscription quotes',robots:{index:false,follow:false,nocache:true}};
const money=(n:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(n/100);
export default async function CustomerQuotesPage({searchParams}:{searchParams:Promise<{result?:string}>}){
  if(process.env.SALSYS_CONTRACT_QUOTES_ENABLED!=='true')notFound();
  const workspace=await requireAdminWorkspaceAccess();
  if(workspace.role!=='owner')notFound();
  let rows:CustomerQuote[];
  try{rows=await loadCustomerQuotes();}catch{notFound();}
  const result=(await searchParams).result;
  return (<><PageFeedback error={result === 'error' ? 'Operation not completed. Check permissions and approval, then retry.' : null} notice={result === 'accepted' ? 'Quote acceptance recorded.' : null} />{<main className="space-y-4">
    <Link href="/settings/subscription/changes" className="text-sm underline">Plan change requests</Link>
    <h1 className="text-2xl font-semibold">Your subscription quotes</h1>
    <p className="text-sm">Review the exact first-period amount. Accepting a quote is non-binding, does not initiate a payment, and does not change your plan or authorize automatic renewal.</p>
    {result==='error'?<p role="alert">Acceptance unavailable. Refresh and verify the current quote.</p>:result==='accepted'?<p role="status">Quote acceptance recorded. Your subscription remains unchanged.</p>:null}
    {!rows.length?<p>No quotes recorded.</p>:rows.map(q=><article key={q.id} className="space-y-3 rounded-xl border border-line p-4">
      <h2 className="font-semibold capitalize">{q.plan_code} · version {q.plan_version}</h2>
      <p className="text-sm capitalize">{q.state.replaceAll('_',' ')}</p>
      <dl className="grid grid-cols-2 gap-2 text-sm"><dt>Monthly price</dt><dd>{money(q.monthly_minor)}</dd><dt>Setup fee</dt><dd>{money(q.setup_minor)}</dd><dt>Tax ({q.tax_treatment})</dt><dd>{money(q.tax_minor)}</dd><dt className="font-semibold">First-period total</dt><dd className="font-semibold">{money(q.first_period_total_minor)}</dd></dl>
      <p className="text-sm">Quote expires {new Date(q.expires_at).toISOString().replace('T',' ').slice(0,16)} UTC.</p>
      <details><summary className="cursor-pointer text-sm">Exact plan terms</summary><pre className="overflow-x-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(q.offer_snapshot,null,2)}</pre></details>
      {q.state==='awaiting_acceptance'&&<form action={acceptQuoteAction} className="space-y-3">
        <input type="hidden" name="id" value={q.id}/><input type="hidden" name="digest" value={q.terms_digest}/>
        <label className="flex gap-2 text-sm"><input type="checkbox" required name="confirm" value="review_only"/>I have reviewed this exact quote. I understand that this does not purchase or activate a subscription.</label>
        <button type="submit" className="rounded border border-line p-2 font-semibold">Accept quote for review</button>
      </form>}
    </article>)}
  </main>}</>);
}
