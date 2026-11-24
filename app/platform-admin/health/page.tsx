import 'server-only';
import Link from 'next/link';
import { Activity, ArrowRight, CircleAlert, CheckCircle2, ShieldCheck, TriangleAlert } from 'lucide-react';
import { notFound } from 'next/navigation';
import { PlatformAdminFrame } from '@/components/platform-admin-frame';
import { readPlanReviewState } from '@/lib/commercial/plan-admin';
import { loadPlatformHealth } from '@/lib/platform-health';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Platform operations and security', robots: { index:false,follow:false,nocache:true } };

export default async function PlatformHealthPage() {
  if (process.env.SALSYS_PLATFORM_ADMIN_ENABLED !== 'true') notFound();
  if (!await readPlanReviewState().catch(()=>null)) notFound();
  const snapshot = await loadPlatformHealth().catch(()=>null);
  const health = snapshot?.health;
  const flags = snapshot?.flags;
  const flagRows = flags ? [
    ['Public signup switch', flags.publicSignupSwitch ? 'Enabled' : 'Disabled'],
    ['Signup admission mode', flags.admissionMode ?? 'Unknown'],
    ['Commercial access enforcement', flags.commercialAccess ? 'Enabled' : 'Disabled'],
    ['Trial reconciliation', flags.trialReconciliation ? 'Enabled' : 'Disabled'],
    ['Manual reconciliation', flags.manualReconciliation ? 'Enabled' : 'Disabled'],
    ['Manual activation', flags.manualActivation ? 'Enabled' : 'Disabled'],
    ['Scheduler credential', flags.cronSecretConfigured ? 'Configured' : 'Not configured'],
  ] : [];
  return <PlatformAdminFrame section="health">
    <main className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-wider text-brand-700">Platform operations</p><h1 className="mt-1 text-[28px] font-bold tracking-tight">Operations and security</h1><p className="mt-1 text-sm text-copy-muted">Internal organization monitoring and commercial release configuration. Not a global uptime or security certification.</p></div><Link href="/system-health" className="btn-primary">Review system health <ArrowRight size={16} aria-hidden="true"/></Link></header>
      <section className="rounded-xl border border-line bg-surface p-5 shadow-sm">
        <h2 className="font-semibold">Internal CRM monitoring</h2>
        {health ? <>
          <div className="mt-3 grid gap-3 sm:grid-cols-4">
            {([{label:'Monitored',value:health.total,icon:Activity,tone:'text-brand-700'},{label:'Healthy',value:health.healthy,icon:CheckCircle2,tone:'text-emerald-600'},{label:'Warning',value:health.warning,icon:TriangleAlert,tone:'text-amber-600'},{label:'Critical',value:health.critical,icon:CircleAlert,tone:'text-rose-600'}]).map(({label,value,icon:Icon,tone})=><article key={label} className="rounded-xl border border-line p-4"><Icon size={19} className={tone} aria-hidden="true"/><h3 className="mt-3 text-sm text-copy-muted">{label}</h3><p className="mt-1 text-2xl font-bold tabular-nums">{value}</p></article>)}
          </div>
          {health.critical+health.warning>0 && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface-soft p-3"><span className="flex items-center gap-2 text-sm"><TriangleAlert size={16} className="text-amber-600" aria-hidden="true"/>{health.critical} critical and {health.warning} warning statuses recorded.</span><Link href="/system-health" className="text-sm font-semibold text-brand-700">Review details</Link></div>}
          <p className="mt-3 text-xs text-copy-muted">Source check time: {health.checkedAt}. This covers the internal tenant only and does not establish provider uptime or scheduler execution.</p>
        </> : <p role="status" className="mt-3 text-sm">Internal monitoring summary unavailable.</p>}
        <Link href="/system-health" className="mt-3 inline-block text-sm underline">Review internal system health</Link>
      </section>
      <section className="rounded-xl border border-line bg-surface p-5 shadow-sm">
        <h2 className="flex items-center gap-2 font-semibold"><ShieldCheck size={18} className="text-brand-700" aria-hidden="true"/> Commercial configuration</h2>
        {flags ? <dl className="mt-3 divide-y divide-line">{flagRows.map(([label,value])=><div key={label} className="flex justify-between gap-3 py-2 text-sm"><dt>{label}</dt><dd className="rounded-md bg-surface-soft px-2 py-1 text-xs font-semibold text-copy">{value}</dd></div>)}</dl> : <p role="status" className="mt-3 text-sm">Configuration unavailable.</p>}
        <p className="mt-3 text-xs text-copy-muted">Server configuration only, not evidence that signup is available, a scheduled task executed, or a release was approved. Credential values are never rendered.</p>
      </section>
      <section className="rounded-xl border border-line bg-surface p-5 shadow-sm">
        <h2 className="font-semibold">Governance and release controls</h2>
        <div className="mt-3 flex flex-wrap gap-3"><Link href="/settings/commercial-plans" className="text-sm underline">Plan governance</Link><Link href="/platform-admin" className="text-sm underline">Launch readiness</Link><Link href="/settings/overview" className="text-sm underline">Internal workspace settings</Link></div>
        <p className="mt-3 text-sm text-copy-muted">Platform-wide API uptime, queue execution, AI cost and safety metrics, incident history and independent security review require separate verified sources. This page neither changes switches nor grants access to customer records.</p>
      </section>
    </main>
  </PlatformAdminFrame>;
}
