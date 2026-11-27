import { PageFeedback } from '@/components/page-feedback';
import Link from 'next/link';

import { checkWebsitePricesAction, decideWebsitePriceAction } from '@/app/settings/website-prices/actions';
import { formatMoney } from '@/lib/offer-suggestion';
import { createClient } from '@/lib/supabase/server';
import { requireCurrentOrganizationId } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

type Suggestion = {
  id: string; course_code: string; page_url: string; snapshot_fetched_at: string;
  private_offer: number | null; shared_offer: number | null; private_regular: number | null; shared_regular: number | null;
  current_private: number | null; current_shared: number | null; current_currency: string | null;
  inr_private: number | null; inr_shared: number | null; inr_rate: number | null; inr_status: string; flags: string[];
  course_batches: { start_date: string; end_date: string | null; location: string | null } | null;
};

function usd(n: number | null) {
  return n === null ? '—' : formatMoney(Number(n), 'USD');
}
function inr(n: number | null) {
  return n === null ? '—' : formatMoney(Number(n), 'INR');
}

export default async function WebsitePricesPage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  const query = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return <main className="p-6 text-sm text-copy-muted">Sign in to review website prices.</main>;
  const organizationId = await requireCurrentOrganizationId(supabase, user.id);
  const [{ data: canManage }, { data, error }] = await Promise.all([
    supabase.rpc('can_manage_organization', { p_organization_id: organizationId }),
    supabase.from('course_price_suggestions')
      .select('id, course_code, page_url, snapshot_fetched_at, private_offer, shared_offer, private_regular, shared_regular, current_private, current_shared, current_currency, inr_private, inr_shared, inr_rate, inr_status, flags, course_batches(start_date, end_date, location)')
      .eq('organization_id', organizationId).eq('status', 'pending')
      .order('course_code').order('created_at', { ascending: false }).limit(300),
  ]);
  const rows = (data ?? []) as unknown as Suggestion[];

  return (<><PageFeedback error={query.error} notice={query.notice} />{(
    <main className="mx-auto w-full max-w-6xl space-y-5 px-4 py-6">
      <Link href="/settings" className="text-xs text-copy-muted hover:text-copy">Back to settings</Link>
      <header>
        <h1 className="text-2xl font-semibold text-copy">Course prices from your website</h1>
        <p className="mt-1 max-w-3xl text-sm text-copy-muted">SalsysOS reads prices from your course pages that the SEO crawler saved. The website’s <strong>offer price</strong> becomes the batch price; the crossed-out regular price is kept for reference. Indian prices are converted from USD and approved separately. Nothing changes until you approve.</p>
      </header>

      {query.notice ? <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{query.notice}</div> : null}
      {query.error || error ? <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{query.error || 'Price suggestions are temporarily unavailable.'}</div> : null}

      {canManage === true ? (
        <section className="rounded-2xl border border-line bg-surface p-4">
          <form action={checkWebsitePricesAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="flex flex-col gap-1 text-xs font-semibold text-copy-muted">Today’s USD → INR rate <span className="font-normal">for Indian prices (optional)</span>
              <input name="inr_rate" inputMode="decimal" placeholder="e.g. 84.40" className="w-40 rounded-lg border border-line px-3 py-2 text-sm text-copy"/>
            </label>
            <button className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">Check website prices</button>
            <Link href="/seo" className="text-xs font-semibold text-brand-700 sm:ml-auto">Re-crawl the website first →</Link>
          </form>
          <p className="mt-2 text-xs text-copy-muted">Tip: crawl the website first so prices are current. Pages older than 7 days are flagged.</p>
        </section>
      ) : null}

      {!rows.length ? (
        <section className="rounded-2xl border border-line bg-surface p-6 text-sm text-copy-muted">No prices waiting for review.</section>
      ) : (
        <section className="overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-line text-[11px] uppercase tracking-wide text-copy-muted">
              <tr><th className="px-3 py-2">Batch</th><th className="px-3 py-2">Website offer (USD)</th><th className="px-3 py-2">Regular</th><th className="px-3 py-2">Indian price</th><th className="px-3 py-2">Now in SalsysOS</th><th className="px-3 py-2">Check</th><th className="px-3 py-2"/></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="px-3 py-3">
                    <p className="font-semibold text-copy">{r.course_code}</p>
                    <p className="text-xs text-copy-muted">{r.course_batches?.location ?? '—'} · {r.course_batches?.start_date}{r.course_batches?.end_date ? ` → ${r.course_batches.end_date}` : ''}</p>
                    <a href={r.page_url} target="_blank" rel="noreferrer" className="text-[11px] text-brand-700">Website page ↗</a>
                  </td>
                  <td className="px-3 py-3 text-xs"><p>Private <strong>{usd(r.private_offer)}</strong></p><p>Twin <strong>{usd(r.shared_offer)}</strong></p></td>
                  <td className="px-3 py-3 text-xs text-copy-muted"><p>{usd(r.private_regular)}</p><p>{usd(r.shared_regular)}</p></td>
                  <td className="px-3 py-3 text-xs">
                    {r.inr_status === 'none' ? <span className="text-copy-muted">No rate entered</span> : (
                      <><p>Private <strong>{inr(r.inr_private)}</strong></p><p>Twin <strong>{inr(r.inr_shared)}</strong></p><p className="mt-0.5 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800">Needs approval · rate {r.inr_rate}</p></>
                    )}
                  </td>
                  <td className="px-3 py-3 text-xs text-copy-muted"><p>{r.current_private ? formatMoney(Number(r.current_private), r.current_currency || 'USD') : 'No price'}</p><p>{r.current_shared ? formatMoney(Number(r.current_shared), r.current_currency || 'USD') : ''}</p></td>
                  <td className="px-3 py-3 text-xs">{r.flags?.length ? <ul className="space-y-1 text-amber-800">{r.flags.map((f) => <li key={f}>⚠ {f}</li>)}</ul> : <span className="text-emerald-700">Looks fine</span>}</td>
                  <td className="px-3 py-3">
                    {canManage === true ? (
                      <form action={decideWebsitePriceAction} className="flex flex-col gap-1.5">
                        <input type="hidden" name="suggestion_id" value={r.id}/>
                        {r.inr_status === 'pending' ? <button name="decision" value="approve_both" className="rounded-lg bg-emerald-700 px-2.5 py-1.5 text-xs font-semibold text-white">Approve USD + ₹</button> : null}
                        <button name="decision" value="approve_usd" className="rounded-lg border border-emerald-300 px-2.5 py-1.5 text-xs font-semibold text-emerald-800">Approve USD only</button>
                        <button name="decision" value="reject" className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-rose-700">Reject</button>
                      </form>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </main>
  )}</>);
}
