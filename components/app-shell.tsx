'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  Bell,
  Boxes,
  ChevronDown,
  CircleDollarSign,
  ContactRound,
  FileSearch,
  Gauge,
  GitBranch,
  LineChart,
  ListTodo,
  MessageSquareText,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
  Tags,
  Target,
  Megaphone,
} from 'lucide-react';
import { ReactNode, useState } from 'react';
import { signOutAction } from '@/app/actions/auth';
import { LiveRefresh } from '@/components/live-refresh';
import { ThemeToggle } from '@/components/theme-toggle';


const nav = [
  { href: '/dashboard', label: 'Dashboard', icon: Gauge },

  { href: '/leads', label: 'Leads', icon: ContactRound },

  { href: '/pipeline', label: 'Pipeline', icon: Boxes },

  { href: '/conversations', label: 'Conversations', icon: MessageSquareText },

  { href: '/follow-ups', label: 'Follow-ups', icon: ListTodo },

  { href: '/campaigns', label: 'Campaigns', icon: Target },

  { href: '/attribution', label: 'Attribution', icon: LineChart },

  { href: '/tracking', label: 'Tracking', icon: Tags },

  { href: '/analytics', label: 'Analytics', icon: BarChart3 },

  { href: '/funnel', label: 'Funnel', icon: GitBranch },

  { href: '/re-engaged', label: 'Re-engaged Leads', icon: RefreshCw },

  { href: '/seo', label: 'SEO', icon: FileSearch },

  { href: '/revenue', label: 'Revenue Forecast', icon: CircleDollarSign },
  {
  href: '/paid-media-leads',
  label: 'Paid Media Leads',
  icon: Megaphone,
},
  { href: '/settings', label: 'Settings', icon: Settings },
  
];

function BrandMark() {
  return (
    <div className="grid h-10 w-10 place-items-center rounded-2xl bg-brand text-white shadow-sm">
      <span className="text-sm font-black tracking-tight">YK</span>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const current =
    nav.find((item) => pathname.startsWith(item.href))?.label ??
    'Growth CRM';
  const mock = process.env.NEXT_PUBLIC_USE_MOCK_DATA !== 'false';

  if (pathname.startsWith('/login')) return <>{children}</>;

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[250px_1fr]">
      <LiveRefresh enabled={!mock} />

      <aside
        className={`${
          mobileOpen ? 'flex' : 'hidden'
        } fixed inset-y-0 left-0 z-40 h-screen w-[250px] flex-col border-r border-slate-200 bg-white p-4 lg:sticky lg:top-0 lg:flex lg:w-auto`}
      >
        <div className="flex items-center gap-3 px-2 py-2">
          <BrandMark />

          <div>
            <div className="font-bold leading-tight text-slate-900">
              Yogakulam
            </div>

            <div className="text-xs font-medium text-slate-400">
              Growth CRM · v0.7
            </div>
          </div>
        </div>

        <div
          className={`mt-6 rounded-2xl border p-3 ${
            mock
              ? 'border-orange-100 bg-orange-50/70'
              : 'border-emerald-100 bg-emerald-50/70'
          }`}
        >
          <div
            className={`flex items-center gap-2 text-xs font-semibold ${
              mock ? 'text-orange-700' : 'text-emerald-700'
            }`}
          >
            <Sparkles size={14} />

            {mock ? 'Development mode' : 'Supabase live'}
          </div>

          <p
            className={`mt-1.5 text-xs leading-5 ${
              mock ? 'text-orange-700/75' : 'text-emerald-700/75'
            }`}
          >
            {mock
              ? 'Using fictional CRM data until Supabase is connected.'
              : 'Authenticated CRM data is persistent and live-synced.'}
          </p>
        </div>

        <nav className="mt-5 min-h-0 flex-1 space-y-1 overflow-y-auto pb-2">
          {nav.map((item) => {
            const Icon = item.icon;
            const active = pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                  active
                    ? 'bg-brand text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon size={18} strokeWidth={1.9} />

                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-4 shrink-0 rounded-2xl border border-slate-200 bg-white p-3">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-xs font-bold text-slate-700">
              AD
            </div>

            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-slate-800">
                CRM User
              </div>

              <div className="text-xs text-slate-400">
                {mock ? 'Development access' : 'Authenticated'}
              </div>
            </div>

            {mock ? (
              <ChevronDown size={16} className="text-slate-400" />
            ) : (
              <form action={signOutAction}>
                <button
                  type="submit"
                  className="text-xs font-semibold text-slate-500 hover:text-brand"
                >
                  Sign out
                </button>
              </form>
            )}
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur lg:px-7">
          <button
            className="btn-secondary !px-3 lg:hidden"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Toggle navigation"
          >
            ☰
          </button>

          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
              Yogakulam Academy
            </div>

            <div className="truncate text-sm font-bold text-slate-800">
              {current}
            </div>
          </div>

          <form
            action="/leads"
            method="get"
            className="ml-auto hidden w-full max-w-[360px] items-center rounded-xl border border-slate-200 bg-slate-50 px-3 sm:flex"
          >
            <Search size={16} className="text-slate-400" />

            <input
              name="q"
              className="w-full bg-transparent px-2 py-2.5 text-sm outline-none placeholder:text-slate-400"
              placeholder="Search lead, course or country…"
            />

            <kbd className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] text-slate-400">
              Enter
            </kbd>
          </form>

          <ThemeToggle />

          <button
            className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
            aria-label="Notifications"
          >
            <Bell size={18} />
          </button>

          <Link
            href="/leads/new"
            className="btn-primary hidden sm:inline-flex"
          >
            <ContactRound size={16} />
            Add lead
          </Link>
        </header>

        <main className="mx-auto w-full max-w-[1600px] p-4 sm:p-6 lg:p-7">
          {children}
        </main>
      </div>
    </div>
  );
}
