import 'server-only';
import Link from 'next/link';
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
      <header><h1 className="text-2xl font-bold">Operations and security</h1><p className="mt-1 text-sm text-copy-muted">Internal organization monitoring and commercial release configuration. Not a global uptime or security certification.</p></header>
      <section className="rounded-xl border border-line p-5">
        <h2 className="font-semibold">Internal CRM monitoring</h2>
        {health ? <>
          <div className="mt-3 grid gap-3 sm:grid-cols-4">
            {([['Monitored',health.total],['Healthy',health.healthy],['Warning',health.warning],['Critical',health.critical]] as const).map(([label,value])=><article key={label} className="rounded-lg border border-line p-3"><h3 className="text-sm">{label}</h3><p className="mt-2 text-2xl font-bold">{value}</p></article>)}
          </div>
          <p className="mt-3 text-xs text-copy-muted">Source check time: {health.checkedAt}. This covers the internal tenant only and does not establish provider uptime or scheduler execution.</p>
        </> : <p role="status" className="mt-3 text-sm">Internal monitoring summary unavailable.</p>}
        <Link href="/system-health" className="mt-3 inline-block text-sm underline">Review internal system health</Link>
      </section>
      <section className="rounded-xl border border-line p-5">
        <h2 className="font-semibold">Commercial configuration</h2>
        {flags ? <dl className="mt-3 divide-y divide-line">{flagRows.map(([label,value])=><div key={label} className="flex justify-between gap-3 py-2 text-sm"><dt>{label}</dt><dd className="font-medium">{value}</dd></div>)}</dl> : <p role="status" className="mt-3 text-sm">Configuration unavailable.</p>}
        <p className="mt-3 text-xs text-copy-muted">Server configuration only, not evidence that signup is available, a scheduled task executed, or a release was approved. Credential values are never rendered.</p>
      </section>
      <section className="rounded-xl border border-line p-5">
        <h2 className="font-semibold">Governance and release controls</h2>
        <div className="mt-3 flex flex-wrap gap-3"><Link href="/settings/commercial-plans" className="text-sm underline">Plan governance</Link><Link href="/platform-admin" className="text-sm underline">Launch readiness</Link><Link href="/settings/overview" className="text-sm underline">Internal workspace settings</Link></div>
        <p className="mt-3 text-sm text-copy-muted">Platform-wide API uptime, queue execution, AI cost and safety metrics, incident history and independent security review require separate verified sources. This page neither changes switches nor grants access to customer records.</p>
      </section>
    </main>
  </PlatformAdminFrame>;
}
