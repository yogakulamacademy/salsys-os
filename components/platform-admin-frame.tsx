import 'server-only';
import Link from 'next/link';
import type { ReactNode } from 'react';

type PlatformSection = 'overview' | 'plans' | 'pilot';

// Presentation only. Callers must authorize each page and its data before
// rendering. Server actions retain their own independent authorization.
export function PlatformAdminFrame({ section, children }: { section: PlatformSection; children: ReactNode }) {
  if (process.env.SALSYS_PLATFORM_ADMIN_ENABLED !== 'true') return <>{children}</>;
  const links = [
    { id: 'overview', label: 'Overview', href: '/platform-admin' },
    { id: 'plans', label: 'Plans and governance', href: '/settings/commercial-plans' },
    ...(process.env.SALSYS_MANUAL_PILOT_ENABLED === 'true'
      ? [{ id: 'pilot', label: 'Manual subscriptions', href: '/settings/commercial-plans/pilot' }]
      : []),
  ];
  const businessLinks = [
    ['Command Center', '/home'],
    ['Sales CRM', '/leads'],
    ['Conversations', '/conversations'],
    ['Marketing', '/marketing'],
    ['Search intelligence', '/seo'],
    ['Revenue', '/revenue'],
    ['Performance', '/performance'],
    ['Automation', '/automation'],
    ['Workspace settings', '/settings/overview'],
  ];
  return (
    <div className="min-h-screen bg-surface text-copy-strong">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line px-6 py-4">
        <div><p className="font-semibold">SalsysOS</p><p className="text-xs text-copy-muted">Platform administration</p></div>
        <Link href="/home" className="rounded-lg border border-line px-4 py-2 text-sm font-semibold">Open business workspace</Link>
      </header>
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 md:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="Platform administration" className="self-start space-y-2 rounded-xl border border-line p-3">
          {links.map(link => <Link key={link.id} href={link.href} aria-current={section === link.id ? 'page' : undefined} className={section === link.id ? 'block rounded-lg bg-brand-700 px-3 py-2 text-sm font-semibold text-white' : 'block rounded-lg px-3 py-2 text-sm hover:bg-surface-muted'}>{link.label}</Link>)}
          <div className="space-y-1 border-t border-line pt-3">
            <p className="px-3 text-xs font-semibold text-copy-muted">Internal business</p>
            {businessLinks.map(([label, href]) => <Link key={href} href={href} className="block rounded-lg px-3 py-2 text-sm hover:bg-surface-muted">{label}</Link>)}
            <p className="px-3 pt-2 text-xs text-copy-muted">Business routes retain their existing organization permissions and provider requirements.</p>
          </div>
        </nav>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
