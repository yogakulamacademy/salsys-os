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
    <div className={mobile ? 'space-y-5' : 'space-y-6'}>
      {groups.map((group) => (
        <section key={group.label}>
          <div className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-copy-subtle">
            {group.label}
          </div>
          <div className="space-y-1">
            {group.items.map(({ href, label, icon: Icon }) => {
              const active = isActive(pathname, href);

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
              Manage leads, admissions, conversations and customer context in one workspace.
            </div>
          </div>
          <NavigationLinks mobile />
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
              Manage leads, admissions, conversations and customer context in one workspace.
            </p>
          </div>
          <NavigationLinks />
        </div>
      </aside>
    </>
  );
}
