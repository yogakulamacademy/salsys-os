import 'server-only';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PlatformAdminFrame } from '@/components/platform-admin-frame';
import { readPlanReviewState } from '@/lib/commercial/plan-admin';
import { loadPlatformOnboardingSummary } from '@/lib/platform-onboarding-summary';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Customer success', robots: { index:false,follow:false,nocache:true } };

export default async function PlatformCustomerSuccessPage() {
  if (process.env.SALSYS_PLATFORM_ADMIN_ENABLED !== 'true') notFound();
  if (!await readPlanReviewState().catch(()=>null)) notFound();
  const summary = await loadPlatformOnboardingSummary().catch(()=>null);
  return <PlatformAdminFrame section="success">
    <main className="space-y-6">
      <header><h1 className="text-2xl font-bold">Customer success</h1><p className="mt-1 text-sm text-copy-muted">Organization onboarding and operational review. Registry counts are not paying-customer or adoption metrics.</p></header>
      <section className="rounded-xl border border-line p-5">
        <h2 className="font-semibold">Onboarding progress</h2>
        {summary ? <>
          <p className="mt-2 text-sm">Registered non-platform organizations: <strong>{summary.registered}</strong></p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {Object.entries(summary.recorded).map(([status,count])=><article key={status} className="rounded-lg border border-line p-3"><h3 className="text-sm capitalize">{status.replaceAll('_',' ')}</h3><p className="mt-2 text-2xl font-bold">{count}</p></article>)}
            <article className="rounded-lg border border-line p-3"><h3 className="text-sm">No onboarding record</h3><p className="mt-2 text-2xl font-bold">{summary.missingRecords}</p></article>
            <article className="rounded-lg border border-line p-3"><h3 className="text-sm">Incomplete with enforcement configured</h3><p className="mt-2 text-2xl font-bold">{summary.enforcedIncomplete}</p></article>
          </div>
        </> : <p role="status" className="mt-3 text-sm">Onboarding monitoring unavailable.</p>}
        <p className="mt-3 text-xs text-copy-muted">Includes demo and legacy organizations. Missing records do not imply incomplete onboarding. Enforcement configuration does not prove a login was blocked. Counts are separate reads and may change during updates.</p>
        <Link href="/settings/organizations" className="mt-3 inline-block text-sm underline">Review organization onboarding</Link>
      </section>
      <section className="rounded-xl border border-line p-5"><h2 className="font-semibold">Customer success scope</h2><p className="mt-2 text-sm text-copy-muted">Product adoption, support tickets and churn risk require separately approved data sources and definitions. They are not inferred from onboarding status.</p></section>
    </main>
  </PlatformAdminFrame>;
}
