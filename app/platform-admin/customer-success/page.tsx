import 'server-only';
import Link from 'next/link';
import { ArrowRight, Building2, CheckCircle2, Clock3 } from 'lucide-react';
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
      <header className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-wider text-brand-700">Customer lifecycle</p><h1 className="mt-1 text-[28px] font-bold tracking-tight">Customer success</h1><p className="mt-1 text-sm text-copy-muted">Organization onboarding and operational review. Registry counts are not paying-customer or adoption metrics.</p></div><Link href="/settings/organizations" className="btn-primary">Review organizations <ArrowRight size={16} aria-hidden="true"/></Link></header>
      <section className="rounded-xl border border-line bg-surface p-5 shadow-sm">
        <h2 className="font-semibold">Onboarding progress</h2>
        {summary ? <>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {([{label:'Registered organizations',count:summary.registered,icon:Building2},{label:'Completed onboarding',count:summary.recorded.completed,icon:CheckCircle2},{label:'Onboarding in progress',count:summary.recorded.in_progress,icon:Clock3}]).map(({label,count,icon:Icon})=><article key={label} className="rounded-xl border border-line p-4"><Icon size={19} className="text-brand-700" aria-hidden="true"/><h3 className="mt-3 text-sm text-copy-muted">{label}</h3><p className="mt-1 text-2xl font-bold tabular-nums">{count}</p></article>)}
          </div>
          {summary.registered>0 && <div className="mt-5"><p className="mb-2 text-xs font-semibold text-copy-muted">Distribution of registered non-platform organizations</p><div className="flex h-3 overflow-hidden rounded-full bg-surface-soft" role="img" aria-label={Object.entries(summary.recorded).map(([status,count])=>status.replaceAll('_',' ')+': '+count).concat('no record: '+summary.missingRecords).join(', ')}>{([{count:summary.recorded.completed,color:'bg-emerald-500'},{count:summary.recorded.in_progress,color:'bg-amber-400'},{count:summary.recorded.not_started,color:'bg-brand-700'},{count:summary.recorded.dismissed,color:'bg-slate-400'},{count:summary.missingRecords,color:'bg-slate-300'}]).map(({count,color},index)=><span key={index} className={color} style={{width:(count/summary.registered*100)+'%'}} />)}</div></div>}
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {Object.entries(summary.recorded).map(([status,count])=><article key={status} className="rounded-lg border border-line p-3"><h3 className="text-sm capitalize">{status.replaceAll('_',' ')}</h3><p className="mt-2 text-2xl font-bold">{count}</p></article>)}
            <article className="rounded-lg border border-line p-3"><h3 className="text-sm">No onboarding record</h3><p className="mt-2 text-2xl font-bold">{summary.missingRecords}</p></article>
            <article className="rounded-lg border border-line p-3"><h3 className="text-sm">Incomplete with enforcement configured</h3><p className="mt-2 text-2xl font-bold">{summary.enforcedIncomplete}</p></article>
          </div>
        </> : <p role="status" className="mt-3 text-sm">Onboarding monitoring unavailable.</p>}
        <p className="mt-3 text-xs text-copy-muted">Includes demo and legacy organizations. Missing records do not imply incomplete onboarding. Enforcement configuration does not prove a login was blocked. Counts are separate reads and may change during updates.</p>
        <Link href="/settings/organizations" className="mt-3 inline-block text-sm underline">Review organization onboarding</Link>
      </section>
      <section className="rounded-xl border border-line bg-surface p-5 shadow-sm"><h2 className="font-semibold">Customer success scope</h2><p className="mt-2 text-sm text-copy-muted">Product adoption, support tickets and churn risk require separately approved data sources and definitions. They are not inferred from onboarding status.</p></section>
    </main>
  </PlatformAdminFrame>;
}
