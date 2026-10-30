'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  AlertTriangle,
  ChevronDown,
  CircleDollarSign,
  DatabaseZap,
  Inbox,
  LayoutDashboard,
  ListTodo,
  Rows3,
  RotateCcw,
  UserRoundSearch,
  UsersRound,
} from 'lucide-react';

type NavigationItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
};

type NavigationGroup = {
  label: string;
  items: NavigationItem[];
};

const groups: NavigationGroup[] = [
  {
    label: 'Workspace',
    items: [
      { href: '/crm', label: 'Sales Overview', icon: LayoutDashboard },
      { href: '/dashboard', label: 'Today', icon: Activity },
      { href: '/admissions', label: 'Admissions', icon: UsersRound },
    ],
  },
  {
    label: 'Selling',
    items: [
      { href: '/leads', label: 'Leads', icon: UserRoundSearch },
      { href: '/pipeline', label: 'Pipeline', icon: Rows3 },
      { href: '/conversations', label: 'Inbox', icon: Inbox },
      { href: '/follow-ups', label: 'Tasks & Follow-ups', icon: ListTodo },
    ],
  },
  {
    label: 'Customer & quality',
    items: [
      { href: '/customer-360', label: 'Customer 360', icon: UsersRound },
      { href: '/data-quality', label: 'Data Quality', icon: DatabaseZap },
      { href: '/re-engaged', label: 'Re-engaged', icon: RotateCcw },
    ],
  },
  {
    label: 'Saved views',
    items: [
      { href: '/leads?stage=payment_pending', label: 'Payment Pending', icon: CircleDollarSign },
      { href: '/leads?view=attention', label: 'Aging Alerts', icon: AlertTriangle },
    ],
  },
];

function pathOnly(href: string) {
  return href.split('?')[0];
}

function isActive(pathname: string, href: string) {
  if (href.includes('?')) return false;
  const path = pathOnly(href);
  if (path === '/crm') return pathname === path;
  if (path === '/dashboard') return pathname === path;
  if (path === '/leads') return pathname === '/leads' || pathname.startsWith('/leads/');
  return pathname === path || pathname.startsWith(`${path}/`);
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
            {group.items.map(({ href, label, icon: Icon }) => {
              const active = isActive(pathname, href);

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
    .find((item) => isActive(pathname, item.href));

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
              Work priorities, leads, conversations, pipeline and customer context from one place.
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
              Work priorities, leads, conversations, pipeline and customer context from one place.
            </p>
          </div>
          <NavigationLinks />
        </div>
      </aside>
    </>
  );
}
