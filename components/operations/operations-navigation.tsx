'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, ChevronDown, FileCheck2, LayoutDashboard, ShieldCheck, UsersRound } from 'lucide-react';

// Operations menu (owner request, 26 Nov 2026): a side menu like Marketing's
// instead of the "Operations workspace" bar on top of every page.

const under = (path: string, base: string) => path === base || path.startsWith(`${base}/`);

const items = [
  { key: 'overview', href: '/operations', label: 'Overview', description: 'What starts next and what’s missing', icon: LayoutDashboard },
  { key: 'batches', href: '/course-management', label: 'Programs & Batches', description: 'Dates, seats and fees for every batch', icon: BookOpen },
  { key: 'enrolments', href: '/enrollments', label: 'Enrolments', description: 'Who has paid, and which batch they join', icon: FileCheck2 },
  { key: 'availability', href: '/availability', label: 'Availability', description: 'Seats left and batches filling up', icon: ShieldCheck },
] as const;

function Links({ path, scope }: { path: string; scope: string }) {
  return (
    <nav className="space-y-1" aria-label="Operations pages">
      {items.map((item) => {
        const active = under(path, item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-label={item.label}
            aria-describedby={`ops-nav-${scope}-${item.key}`}
            aria-current={active ? 'page' : undefined}
            className={`group relative flex min-h-10 items-start gap-2.5 rounded-ui px-3 py-2.5 transition ${active ? 'bg-brand-50 dark:bg-brand-950/40' : 'hover:bg-surface-muted'}`}
          >
            {active ? <span className="absolute -left-4 top-3 h-5 w-[3px] rounded-r bg-brand-700" /> : null}
            <Icon size={16} className={`mt-0.5 shrink-0 ${active ? 'text-brand-700 dark:text-brand-300' : 'text-copy-subtle group-hover:text-brand-700'}`} />
            <span className="min-w-0">
              <span className={`block text-[13.5px] ${active ? 'font-bold text-brand-700 dark:text-brand-200' : 'font-semibold text-copy-strong'}`}>{item.label}</span>
              <span id={`ops-nav-${scope}-${item.key}`} className="block text-[11.5px] leading-4 text-copy-muted">{item.description}</span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

export function OperationsNavigation() {
  const path = usePathname();
  const current = items.find((item) => under(path, item.href));
  return (
    <>
      <details className="group rounded-panel border border-line bg-surface lg:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 text-sm font-semibold text-copy-strong [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-ui bg-brand-50 text-brand-700"><BookOpen size={16} /></span>
            {current?.label || 'Operations'}
          </span>
          <ChevronDown size={16} className="text-copy-subtle transition group-open:rotate-180" />
        </summary>
        <div className="border-t border-line p-3"><Links path={path} scope="m" /></div>
      </details>

      <aside
        className="sticky top-16 hidden h-[calc(100vh-4rem)] self-start overflow-y-auto overflow-x-hidden overscroll-contain border-r border-line pr-4 lg:block [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label="Operations navigation"
      >
        <div className="flex min-h-full flex-col pb-6 pt-4">
          <div className="mb-5 px-3 pt-1">
            <div className="text-[18px] font-semibold tracking-[-0.025em] text-copy-strong">Operations</div>
            <p className="mt-1.5 max-w-[195px] text-[13px] leading-5 text-copy-muted">Batches, seats and the people joining them.</p>
          </div>
          <Links path={path} scope="d" />
          <div className="mt-auto border-t border-line px-3 pt-4 text-[12px] leading-5 text-copy-muted">
            <Link href="/admissions" className="inline-flex items-center gap-1.5 font-semibold text-copy-strong hover:text-brand-700">
              <UsersRound size={13} /> Admissions desk
            </Link>
            <span className="block">Payments and bookings in progress live in Sales.</span>
          </div>
        </div>
      </aside>
    </>
  );
}
