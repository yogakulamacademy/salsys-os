'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  AlertTriangle,
  ChevronDown,
  CircleDollarSign,
  Inbox,
  LayoutDashboard,
  ListTodo,
  UserRoundSearch,
  UsersRound,
} from 'lucide-react';

type NavigationItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  matches?: string[];
};

type NavigationGroup = {
  label: string;
  items: NavigationItem[];
};

const groups: NavigationGroup[] = [
  {
    label: 'Workspace',
    items: [
      { href: '/crm', label: 'Command Center', icon: LayoutDashboard },
      {
        href: '/work-queue',
        label: 'Work Queue',
        icon: ListTodo,
        matches: ['/work-queue', '/dashboard', '/admissions', '/follow-ups'],
      },
    ],
  },
  {
    label: 'Selling',
    items: [
      {
        href: '/opportunities',
        label: 'Opportunities',
        icon: UserRoundSearch,
        matches: ['/opportunities', '/leads', '/pipeline', '/re-engaged', '/data-quality'],
      },
      { href: '/conversations', label: 'Inbox', icon: Inbox },
    ],
  },
  {
    label: 'Customers',
    items: [
      { href: '/customer-360', label: 'Customers', icon: UsersRound },
    ],
  },
  {
    label: 'Saved views',
    items: [
      { href: '/opportunities?view=payment_pending', label: 'Payment Pending', icon: CircleDollarSign },
      { href: '/opportunities?view=stuck', label: 'Aging Alerts', icon: AlertTriangle },
    ],
  },
];

function pathOnly(href: string) {
  return href.split('?')[0];
}

function pathMatches(pathname: string, path: string) {
  if (path === '/crm') return pathname === path;
  return pathname === path || pathname.startsWith(`${path}/`);
}

function isActive(pathname: string, item: NavigationItem) {
  if (item.href.includes('?')) return false;
  const candidates = item.matches ?? [pathOnly(item.href)];
  return candidates.some((path) => pathMatches(pathname, path));
}

function NavigationLinks({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname();

  return (
    <div className={mobile ? 'space-y-6' : 'space-y-7'}>
      {groups.map((group) => (
        <section key={group.label}>
          <div className="mb-2.5 px-3 text-[12px] font-semibold uppercase tracking-[0.1em] text-copy-subtle">
            {group.label}
          </div>
          <div className="space-y-1.5">
            {group.items.map((item) => {
              const { href, label, icon: Icon } = item;
              const active = isActive(pathname, item);

              return (
                <Link
                  key={`${href}-${label}`}
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={`group relative flex min-h-11 items-center gap-3 rounded-ui px-3 py-2.5 text-[14px] transition ${
                    active
                      ? 'bg-brand-50 font-semibold text-brand-700'
                      : 'font-medium text-copy-muted hover:bg-surface-muted hover:text-copy-strong'
                  }`}
                >
                  {active ? (
                    <span className="absolute -left-4 h-6 w-[3px] rounded-r bg-brand-700" />
                  ) : null}
                  <Icon
                    size={17}
                    className={
                      active
                        ? 'text-brand-700'
                        : 'text-copy-subtle transition group-hover:text-brand-700'
                    }
                  />
                  <span>{label}</span>
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
  const current = groups
    .flatMap((group) => group.items)
    .find((item) => isActive(pathname, item));

  return (
    <>
      <details className="group rounded-panel border border-line bg-surface min-[768px]:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-4 text-[15px] font-semibold text-copy-strong [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-ui bg-brand-50 text-brand-700">
              <UsersRound size={17} />
            </span>
            {current?.label || 'Sales'}
          </span>
          <ChevronDown size={17} className="text-copy-subtle transition group-open:rotate-180" />
        </summary>
        <div className="border-t border-line p-4">
          <div className="mb-5 rounded-ui bg-surface-soft px-4 py-3.5">
            <div className="text-[16px] font-semibold text-copy-strong">Sales</div>
            <div className="mt-1.5 text-[14px] leading-6 text-copy-muted">
              Decide what needs attention, work opportunities, handle conversations and understand each customer relationship.
            </div>
          </div>
          <NavigationLinks mobile />
        </div>
      </details>

      <aside
        className="hidden min-h-[calc(100vh-7rem)] border-r border-line pr-5 min-[768px]:block"
        aria-label="Sales navigation"
      >
        <div className="sticky top-20 pb-10">
          <div className="mb-8 px-3 pt-1">
            <div className="text-[20px] font-semibold tracking-[-0.025em] text-copy-strong">
              Sales
            </div>
            <p className="mt-2 max-w-[205px] text-[14px] leading-6 text-copy-muted">
              Command the day, work opportunities, respond to customers and keep relationship context connected.
            </p>
          </div>
          <NavigationLinks />
        </div>
      </aside>
    </>
  );
}
