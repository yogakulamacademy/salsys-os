import 'server-only';
import Link from 'next/link';
import { ArrowRight, BarChart3, BriefcaseBusiness, CheckCircle2, CircleAlert, Megaphone, Plug, Settings, Wallet } from 'lucide-react';
import { notFound } from 'next/navigation';
import { PlatformAdminFrame } from '@/components/platform-admin-frame';
import { readPlanReviewState } from '@/lib/commercial/plan-admin';
import { loadPlatformBusinessReadiness } from '@/lib/platform-business-readiness';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Internal business operations', robots: { index: false, follow: false, nocache: true } };

const workspaceIcons = { sales: BriefcaseBusiness, marketing: Megaphone, finance: Wallet, reports: BarChart3, admin: Settings };
const workspaces = [
  { code: 'sales' as const, label: 'Sales', destinations: [['Sales CRM', '/leads'], ['Conversations', '/conversations']] },
  { code: 'marketing' as const, label: 'Marketing', destinations: [['Marketing center', '/marketing'], ['Campaigns', '/marketing?view=campaigns'], ['Search intelligence', '/seo'], ['Analytics', '/marketing?view=analytics']] },
  { code: 'finance' as const, label: 'Finance', destinations: [['CRM revenue', '/revenue']] },
  { code: 'reports' as const, label: 'Reports', destinations: [['Performance', '/performance']] },
  { code: 'admin' as const, label: 'Administration', destinations: [['Settings', '/settings/overview'], ['Integrations', '/settings/integrations'], ['Automation', '/automation']] },
];

export default async function PlatformBusinessPage() {
  if (process.env.SALSYS_PLATFORM_ADMIN_ENABLED !== 'true') notFound();
  if (!await readPlanReviewState().catch(() => null)) notFound();
  const readiness = await loadPlatformBusinessReadiness().catch(() => null);
  return <PlatformAdminFrame section="business">
    <main className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-wider text-brand-700">Internal workspace</p><h1 className="mt-1 text-[28px] font-bold tracking-tight">Business operations</h1><p className="mt-1 text-sm text-copy-muted">Operate SalsysOS as its own business. These links use existing organization access checks, not platform-wide customer permissions.</p></div><Link href="/home" className="btn-primary">Open CRM <ArrowRight size={16} aria-hidden="true"/></Link></header>
      <section className="rounded-xl border border-line bg-surface p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Business workspaces</h2>{readiness && <span className="text-xs font-semibold text-copy-muted">{workspaces.filter(workspace => readiness.workspaceCodes.includes(workspace.code)).length} / {workspaces.length} permitted</span>}</div>
        {!readiness ? <p role="status" className="mt-3 text-sm">Workspace access could not be verified.</p> :
          <div className="mt-3 grid gap-3 sm:grid-cols-2">{workspaces.map(workspace => {
            const permitted = readiness.workspaceCodes.includes(workspace.code);
            const Icon = workspaceIcons[workspace.code];
            return <article key={workspace.code} className="rounded-xl border border-line bg-surface p-4">
              <div className="flex items-start justify-between gap-2"><span className="grid h-10 w-10 place-items-center rounded-lg bg-brand-50 text-brand-700"><Icon size={19} aria-hidden="true"/></span><span className="inline-flex items-center gap-1 text-xs font-medium text-copy-muted">{permitted ? <CheckCircle2 size={14} className="text-emerald-600" aria-hidden="true"/> : <CircleAlert size={14} aria-hidden="true"/>}{permitted ? 'Workspace permitted' : 'Workspace not permitted'}</span></div>
              <h3 className="mt-3 text-lg font-semibold">{workspace.label}</h3>
              {permitted && <div className="mt-3 flex flex-wrap gap-2">{workspace.destinations.map(([label, href]) => <Link key={href} href={href} className="inline-flex items-center gap-1 rounded-lg border border-line px-3 py-2 text-xs font-semibold text-brand-700 hover:bg-surface-soft">{label}<ArrowRight size={12} aria-hidden="true"/></Link>)}</div>}
            </article>;
          })}</div>}
        <p className="mt-3 text-xs text-copy-muted">Workspace permission alone does not establish access to each feature or integration. Destination routes retain their own checks.</p>
      </section>
      <section className="rounded-xl border border-line bg-surface p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 font-semibold"><Plug size={18} className="text-brand-700" aria-hidden="true"/> Integration inventory</h2>{readiness?.workspaceCodes.includes('admin') && <Link href="/settings/integrations" className="text-sm font-semibold text-brand-700">Review integrations</Link>}</div>
        {!readiness?.connections ? <p role="status" className="mt-3 text-sm">Connection inventory unavailable.</p> :
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Object.entries(readiness.connections).map(([provider, states]) => <article key={provider} className="rounded-lg border border-line p-4">
            <h3 className="font-semibold capitalize">{provider}</h3><div className="mt-2 flex flex-wrap gap-1">{states.length ? states.map((state,index)=><span key={index} className={'rounded-md px-2 py-1 text-xs font-medium '+(state==='connected'?'bg-emerald-50 text-emerald-700':state==='revoked'||state==='error'?'bg-rose-50 text-rose-700':'bg-surface-soft text-copy-muted')}>{state}</span>):<span className="text-sm text-copy-muted">No connection record</span>}</div>
          </article>)}</div>}
        <p className="mt-3 text-xs text-copy-muted">Stored connection status only; no live provider call, asset validation, credential or customer information.</p>
      </section>
    </main>
  </PlatformAdminFrame>;
}
