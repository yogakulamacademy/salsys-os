import { PageFeedback } from '@/components/page-feedback';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { listQuoteQueue,type QuoteQueueItem } from '@/lib/commercial/contract-quotes';
import { prepareQuoteAction } from './actions';
export const dynamic='force-dynamic';
export const metadata={title:'Subscription quotes',robots:{index:false,follow:false,nocache:true}};
const money=(n:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(n/100);
export default async function QuoteQueuePage({searchParams}:{searchParams:Promise<{result?:string}>}){
  let rows:QuoteQueueItem[];
  try{rows=await listQuoteQueue();}catch{notFound();}
  const result=(await searchParams).result;
  return (<><PageFeedback error={result === 'error' ? 'Operation not completed. Check permissions and approval, then retry.' : null} notice={result === 'prepared' ? 'Quote prepared for review.' : null} />{<main className="space-y-4">
    <Link href="/settings/commercial-plans" className="text-sm underline">Commercial plans</Link>
    <h1 className="text-2xl font-semibold">Subscription quote queue</h1>
    <p className="text-sm">Prepare an exact, expiring quote against the customer's published offer. No charge or plan activation is possible here. Tax and setup amounts require independent verification.</p>
    {result==='error'?<p role="alert">Quote was not saved. Check the request and approved terms.</p>:result==='prepared'?<p role="status">Quote recorded for customer review.</p>:null}
    {!rows.length?<p>No eligible pending requests.</p>:rows.map(r=><article key={r.id} className="space-y-3 rounded-xl border border-line p-4">
      <h2 className="font-semibold">{r.organization_name} · {r.plan_code} v{r.version}</h2>
      <p className="text-sm">Published monthly price: {money(r.amount_minor)}. Setup: {money(r.setup_min_minor)}–{money(r.setup_max_minor)} ({r.setup_optional?'optional':'required'}). Tax {r.tax_treatment}.</p>
      <form action={prepareQuoteAction} className="grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="request" value={r.id}/>
        <label className="grid gap-1 text-sm">Exact setup charge (INR paise)<input className="rounded border border-line p-2" name="setup_minor" type="number" min={0} max={r.setup_max_minor} step={1} required/></label>
        <label className="grid gap-1 text-sm">Verified tax amount (INR paise)<input className="rounded border border-line p-2" name="tax_minor" type="number" min={0} max={2000000000} step={1} required/></label>
        <label className="grid gap-1 text-sm sm:col-span-2">Quote rationale and calculation reference<textarea className="rounded border border-line p-2" name="reason" required minLength={10} maxLength={2048}/></label>
        <button className="rounded border border-line p-2 font-semibold" type="submit">Save exact quote</button>
      </form>
    </article>)}
  </main>}</>);
}
