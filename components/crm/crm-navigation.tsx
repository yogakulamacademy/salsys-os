'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  BadgeCheck,
  ChevronDown,
  ListTodo,
  Rows3,
  RotateCcw,
  Sparkles,
  UserRoundSearch,
  UsersRound,
} from 'lucide-react';

type Counts = { waiting: number; overdue: number; paying: number; saysPaid: number };

type NavigationItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  /** Other routes that belong to this item. */
  also?: string[];
  /** Live badge: which count, what it means, and its colour. */
  badge?: { key: keyof Counts; label: string; tone: 'attention' | 'money' };
};

type NavigationGroup = {
  label: string;
  items: NavigationItem[];
};

// Owner review (20 Nov 2026): Sales Overview (= Home), Today (old command
// center), separate Pipeline (= Admissions tab) and the two saved views
// (duplicates of Leads quick views) were removed; Data Quality moved to
// Settings. Old links still work.
const groups: NavigationGroup[] = [
  {
    label: "Today's work",
    items: [
      { href: '/leads', label: 'Leads', icon: UserRoundSearch, badge: { key: 'waiting', label: 'waiting for a reply', tone: 'attention' } },
      { href: '/admissions', label: 'Pipeline & admissions', icon: Rows3, also: ['/pipeline'], badge: { key: 'paying', label: 'about to pay', tone: 'money' } },
      { href: '/follow-ups', label: 'Tasks & follow-ups', icon: ListTodo, badge: { key: 'overdue', label: 'overdue', tone: 'attention' } },
    ],
  },
  {
    label: 'Win more',
    items: [
      { href: '/re-engaged', label: 'Re-engaged', icon: RotateCcw },
      { href: '/leads#says-paid', label: 'Say they paid', icon: BadgeCheck, badge: { key: 'saysPaid', label: 'to check', tone: 'money' } },
      { href: '/customer-360', label: 'Customer 360', icon: UsersRound },
      { href: '/personas', label: 'Personas', icon: Sparkles },
    ],
  },
];

function pathOnly(href: string) {
  return href.split(/[?#]/)[0];
}

function isActive(pathname: string, item: NavigationItem) {
  if (item.href.includes('#') || item.href.includes('?')) return false;
  const paths = [pathOnly(item.href), ...(item.also ?? [])];
  return paths.some((path) => (path === '/leads'
    ? pathname === '/leads' || pathname.startsWith('/leads/')
    : pathname === path || pathname.startsWith(`${path}/`)));
}

// One fetch per page load, shared by the desktop and mobile menus.
let countsPromise: Promise<Counts | null> | null = null;
function loadCounts(): Promise<Counts | null> {
  countsPromise ??= fetch('/api/crm/nav-counts', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((body) => (body?.counts ?? null) as Counts | null)
    .catch(() => null);
  return countsPromise;
}

function useCounts() {
  const [counts, setCounts] = useState<Counts | null>(null);
  useEffect(() => {
    let alive = true;
    countsPromise = null;
    loadCounts().then((c) => { if (alive) setCounts(c); });
    return () => { alive = false; };
  }, []);
  return counts;
}

function NavigationLinks({ mobile = false, counts }: { mobile?: boolean; counts: Counts | null }) {
  const pathname = usePathname();

  return (
    <div className={mobile ? 'space-y-5' : 'space-y-6'}>
      {groups.map((group) => (
        <section key={group.label}>
          <div className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-copy-subtle">
            {group.label}
          </div>
          <div className="space-y-1">
            {group.items.map((item) => {
              const { href, label, icon: Icon, badge } = item;
              const active = isActive(pathname, item);
              const count = badge && counts ? counts[badge.key] : 0;

              return (
                <Link
                  key={`${href}-${label}`}
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={`group relative flex min-h-10 items-center gap-2.5 rounded-ui px-3 py-2.5 text-[13px] transition ${
                    active
                      ? 'bg-brand-50 font-semibold text-brand-700'
                      : 'font-medium text-copy-muted hover:bg-surface-muted hover:text-copy-strong'
                  }`}
                >
                  {active ? (
                    <span className="absolute -left-4 h-5 w-[3px] rounded-r bg-brand-700" />
                  ) : null}
                  <Icon
                    size={16}
                    className={
                      active
                        ? 'text-brand-700'
                        : 'text-copy-subtle transition group-hover:text-brand-700'
                    }
                  />
                  <span className="min-w-0 flex-1">{label}</span>
                  {badge && count > 0 ? (
                    <span
                      title={`${count.toLocaleString('en-IN')} ${badge.label}`}
                      aria-label={`${count.toLocaleString('en-IN')} ${badge.label}`}
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${
                        badge.tone === 'money'
                          ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                          : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                      }`}
                    >
                      {count > 999 ? '999+' : count.toLocaleString('en-IN')}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

export function CrmNavigation() {
  const pathname = usePathname();
  const counts = useCounts();
  const current = groups
    .flatMap((group) => group.items)
    .find((item) => isActive(pathname, item));

  return (
    <>
      <details className="group rounded-panel border border-line bg-surface lg:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 text-sm font-semibold text-copy-strong [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-ui bg-brand-50 text-brand-700">
              <UsersRound size={16} />
            </span>
            {current?.label || 'CRM'}
          </span>
          <ChevronDown size={16} className="text-copy-subtle transition group-open:rotate-180" />
        </summary>
        <div className="border-t border-line p-3">
          <div className="mb-4 rounded-ui bg-surface-soft px-3 py-3">
            <div className="text-sm font-semibold text-copy-strong">CRM</div>
            <div className="mt-1 text-[13px] leading-5 text-copy-muted">
              Manage leads, admissions, follow-ups and customer context in one workspace.
            </div>
          </div>
          <NavigationLinks mobile counts={counts} />
        </div>
      </details>

      <aside
        className="sticky top-16 hidden h-[calc(100vh-4rem)] self-start overflow-y-auto overflow-x-hidden overscroll-contain border-r border-line pr-4 lg:block [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label="CRM navigation"
      >
        <div className="pb-8 pt-4">
          <div className="mb-7 px-3 pt-1">
            <div className="text-[18px] font-semibold tracking-[-0.025em] text-copy-strong">
              CRM
            </div>
            <p className="mt-1.5 max-w-[195px] text-[13px] leading-5 text-copy-muted">
              Manage leads, admissions, follow-ups and customer context in one workspace.
            </p>
          </div>
          <NavigationLinks counts={counts} />
        </div>
      </aside>
    </>
  );
}

/**
 * CRM tabs across the top (owner-approved CRM mockups, 20 Nov 2026): the
 * same pages and live badges as the old side menu, giving each page the full
 * width. Scrolls sideways on small screens.
 */
export function CrmTabs() {
  const pathname = usePathname();
  const counts = useCounts();
  const items = groups.flatMap((group) => group.items);

  return (
    <nav aria-label="CRM navigation" className="crm-tabs -mx-1 mb-5 overflow-x-auto border-b border-line [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="flex min-w-max items-end gap-1 px-1">
        {items.map((item) => {
          const { href, label, badge } = item;
          const active = isActive(pathname, item);
          const count = badge && counts ? counts[badge.key] : 0;
          return (
            <Link
              key={`${href}-${label}`}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`relative flex h-11 items-center gap-2 whitespace-nowrap px-3.5 text-[14px] transition ${
                active ? 'font-semibold text-copy-strong' : 'font-medium text-copy-muted hover:text-copy-strong'
              }`}
            >
              <span>{label}</span>
              {badge && count > 0 ? (
                <span
                  title={`${count.toLocaleString('en-IN')} ${badge.label}`}
                  aria-label={`${count.toLocaleString('en-IN')} ${badge.label}`}
                  className={`text-[12px] font-bold tabular-nums ${badge.tone === 'money' ? 'text-emerald-700' : 'text-brand-700'}`}
                >
                  {count > 999 ? '999+' : count.toLocaleString('en-IN')}
                </span>
              ) : null}
              {active ? <span className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-brand-700" /> : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
