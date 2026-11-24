import 'server-only';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PlatformAdminFrame } from '@/components/platform-admin-frame';
import { readPlanReviewState } from '@/lib/commercial/plan-admin';
import { loadPlatformBusinessReadiness } from '@/lib/platform-business-readiness';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Internal business operations', robots: { index: false, follow: false, nocache: true } };

const workspaces = [
  { code: 'sales', label: 'Sales', destinations: [['Sales CRM', '/leads'], ['Conversations', '/conversations']] },
  { code: 'marketing', label: 'Marketing', destinations: [['Marketing center', '/marketing'], ['Campaigns', '/marketing?view=campaigns'], ['Search intelligence', '/seo'], ['Analytics', '/marketing?view=analytics']] },
  { code: 'finance', label: 'Finance', destinations: [['CRM revenue', '/revenue']] },
  { code: 'reports', label: 'Reports', destinations: [['Performance', '/performance']] },
  { code: 'admin', label: 'Administration', destinations: [['Settings', '/settings/overview'], ['Integrations', '/settings/integrations'], ['Automation', '/automation']] },
];

export default async function PlatformBusinessPage() {
  if (process.env.SALSYS_PLATFORM_ADMIN_ENABLED !== 'true') notFound();
  if (!await readPlanReviewState().catch(() => null)) notFound();
  const readiness = await loadPlatformBusinessReadiness().catch(() => null);
  return <PlatformAdminFrame section="business">
    <main className="space-y-6">
      <header><h1 className="text-2xl font-bold">Internal business operations</h1><p className="mt-1 text-sm text-copy-muted">Operate SalsysOS as its own business. These links use existing organization access checks, not platform-wide customer permissions.</p></header>
      <section className="rounded-xl border border-line p-5">
        <h2 className="font-semibold">Business workspaces</h2>
        {!readiness ? <p role="status" className="mt-3 text-sm">Workspace access could not be verified.</p> :
          <div className="mt-3 grid gap-3 sm:grid-cols-2">{workspaces.map(workspace => {
            const permitted = readiness.workspaceCodes.includes(workspace.code);
            return <article key={workspace.code} className="rounded-lg border border-line p-4">
              <h3 className="font-medium">{workspace.label}</h3><p className="mt-1 text-sm text-copy-muted">{permitted ? 'Workspace permitted' : 'Workspace not permitted'}</p>
              {permitted && <div className="mt-3 flex flex-wrap gap-3">{workspace.destinations.map(([label, href]) => <Link key={href} href={href} className="text-sm underline">{label}</Link>)}</div>}
            </article>;
          })}</div>}
        <p className="mt-3 text-xs text-copy-muted">Workspace permission alone does not establish access to each feature or integration. Destination routes retain their own checks.</p>
      </section>
      <section className="rounded-xl border border-line p-5">
        <h2 className="font-semibold">Integration inventory</h2>
        {!readiness?.connections ? <p role="status" className="mt-3 text-sm">Connection inventory unavailable.</p> :
          <div className="mt-3 grid gap-3 sm:grid-cols-2">{Object.entries(readiness.connections).map(([provider, states]) => <article key={provider} className="rounded-lg border border-line p-4">
            <h3 className="font-medium capitalize">{provider}</h3><p className="mt-1 text-sm">{states.length ? states.join(', ') : 'No connection record'}</p>
          </article>)}</div>}
        <p className="mt-3 text-xs text-copy-muted">Stored connection status only; no live provider call, asset validation, credential or customer information.</p>
        {readiness?.workspaceCodes.includes('admin') && <Link href="/settings/integrations" className="mt-3 inline-block text-sm underline">Review integrations</Link>}
      </section>
    </main>
  </PlatformAdminFrame>;
}
