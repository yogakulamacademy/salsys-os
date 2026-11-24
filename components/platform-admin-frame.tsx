import 'server-only';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Activity, ArrowLeftRight, Building2, ChevronDown, ChevronRight, CreditCard, LayoutDashboard, Layers3, LogOut, Settings, ShieldCheck, UsersRound, BriefcaseBusiness } from 'lucide-react';
import { BrandMark } from '@/components/brand';
import { signOutAction } from '@/app/actions/auth';

type PlatformSection = 'overview' | 'plans' | 'pilot' | 'customers' | 'business' | 'success' | 'health';

// Presentation only. Callers authorize each page; all actions retain their own checks.
export function PlatformAdminFrame({ section, children }: { section: PlatformSection; children: ReactNode }) {
  if (process.env.SALSYS_PLATFORM_ADMIN_ENABLED !== 'true') return <>{children}</>;
  const groups = [
    { label: 'Platform', links: [
      { id: 'overview', label: 'Overview', href: '/platform-admin', icon: LayoutDashboard },
      { id: 'customers', label: 'Organizations', href: '/settings/organizations', icon: Building2 },
      { id: 'success', label: 'Customer success', href: '/platform-admin/customer-success', icon: UsersRound },
    ] },
    { label: 'Commercial', links: [
      { id: 'plans', label: 'Plans and governance', href: '/settings/commercial-plans', icon: Layers3 },
      ...(process.env.SALSYS_MANUAL_PILOT_ENABLED === 'true'
        ? [{ id: 'pilot', label: 'Manual subscriptions', href: '/settings/commercial-plans/pilot', icon: CreditCard }] : []),
    ] },
    { label: 'Operations', links: [
      { id: 'health', label: 'Operations and security', href: '/platform-admin/health', icon: Activity },
      { id: 'business', label: 'Business operations', href: '/platform-admin/business', icon: BriefcaseBusiness },
    ] },
  ];
  const current = groups.flatMap(group => group.links).find(link => link.id === section)?.label ?? 'Platform administration';
  const navigation = <>{groups.map(group => <div key={group.label} className="space-y-1">
    <p className="px-3 pb-1 pt-3 text-[10px] font-bold uppercase tracking-[.12em] text-copy-muted">{group.label}</p>
    {group.links.map(({ id, label, href, icon: Icon }) => <Link key={id} href={href} aria-current={section === id ? 'page' : undefined} className={'flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-semibold ' + (section === id ? 'bg-brand-700 text-white' : 'text-copy hover:bg-surface-soft')}><Icon size={17} aria-hidden="true" className="shrink-0" /><span className="min-w-0 flex-1">{label}</span>{section === id && <ChevronRight size={14} aria-hidden="true" />}</Link>)}
  </div>)}</>;
  return (
    <div className="min-h-screen bg-mist text-copy-strong lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <aside className="hidden min-w-0 border-r border-line bg-surface lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
        <Link href="/platform-admin" className="flex items-center gap-3 border-b border-line px-5 py-5"><BrandMark /><span><span className="block text-sm font-bold">SalsysOS</span><span className="block text-xs text-copy-muted">Platform administration</span></span></Link>
        <nav aria-label="Platform administration" className="flex-1 space-y-3 overflow-y-auto p-3">{navigation}</nav>
        <div className="space-y-3 border-t border-line p-4">
          <Link href="/home" className="flex items-center gap-2 rounded-lg border border-line p-3 text-sm font-semibold hover:bg-surface-soft"><ArrowLeftRight size={16} aria-hidden="true" /><span>Switch to business CRM</span></Link>
          <p className="text-[11px] leading-4 text-copy-muted">Business tools use existing tenant permissions.</p>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2 text-sm"><ShieldCheck size={17} className="shrink-0 text-brand-700" aria-hidden="true" /><span className="hidden text-copy-muted sm:inline">Platform</span><ChevronRight size={13} className="hidden sm:block" aria-hidden="true" /><span className="font-semibold">{current}</span></div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/home" className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-xs font-semibold hover:bg-surface-soft"><ArrowLeftRight size={15} aria-hidden="true" /> Business CRM</Link>
            <details className="relative"><summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg border border-line px-3 py-2 text-xs font-semibold"><span className="grid h-6 w-6 place-items-center rounded-md bg-brand-50 text-brand-700">SA</span> Account <ChevronDown size={13} aria-hidden="true" /></summary>
              <div className="absolute right-0 z-30 mt-2 w-48 space-y-1 rounded-lg border border-line bg-surface p-2 shadow-panel"><Link href="/settings/overview" className="flex items-center gap-2 rounded-lg p-2 text-sm hover:bg-surface-soft"><Settings size={15} aria-hidden="true" /> Workspace settings</Link><form action={signOutAction}><button type="submit" className="flex w-full items-center gap-2 rounded-lg p-2 text-left text-sm hover:bg-surface-soft"><LogOut size={15} aria-hidden="true" /> Sign out</button></form></div>
            </details>
          </div>
          <details className="w-full lg:hidden"><summary className="cursor-pointer rounded-lg border border-line px-3 py-2 text-sm font-semibold">Platform navigation</summary><nav aria-label="Mobile platform administration" className="mt-2 space-y-2 rounded-lg border border-line p-2">{navigation}</nav></details>
        </header>
        <div className="mx-auto w-full min-w-0 max-w-[1800px] px-4 py-6 sm:px-6 xl:px-8">{children}</div>
      </div>
    </div>
  );
}
