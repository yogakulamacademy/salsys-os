'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  AlertTriangle,
  ChevronDown,
  ContactRound,
  LayoutDashboard,
  ListTodo,
  Rows3,
  UserRoundSearch,
  WalletCards,
} from 'lucide-react';

type Item = {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
};

type Group = {
  label: string;
  items: Item[];
};

const groups: Group[] = [
  {
    label: 'Workspace',
    items: [
      { href: '/crm', label: 'Command Center', icon: LayoutDashboard },
      { href: '/admissions', label: 'Admissions Desk', icon: Activity },
      { href: '/follow-ups', label: 'Follow-ups', icon: ListTodo },
    ],
  },
  {
    label: 'Customers & Sales',
    items: [
      { href: '/leads', label: 'Leads', icon: UserRoundSearch },
      { href: '/pipeline', label: 'Sales Pipeline', icon: Rows3 },
    ],
  },
  {
    label: 'Intelligence',
    items: [
      { href: '/contact-intelligence', label: 'Contact Intelligence', icon: ContactRound },
    ],
  },
  {
    label: 'Quick Views',
    items: [
      { href: '/leads?stage=payment_pending', label: 'Payment-stage leads', icon: WalletCards },
      { href: '/leads?view=attention', label: 'Stage-aging alerts', icon: AlertTriangle },
    ],
  },
];

function pathOnly(href: string) {
  return href.split('?')[0];
}

function isActive(pathname: string, href: string) {
  if (href.includes('?')) return false;
  const path = pathOnly(href);
  if (path === '/leads') return pathname === '/leads' || pathname.startsWith('/leads/');
  return pathname === path || pathname.startsWith(`${path}/`);
}

function Links() {
  const pathname = usePathname();

  return (
    <nav className="space-y-4" aria-label="CRM Operations navigation">
      {groups.map((group) => (
        <div key={group.label}>
          <div className="mb-[7px] px-3 text-[9px] font-bold uppercase tracking-[0.14em] text-[#8A9790]">
            {group.label}
          </div>
          <div className="space-y-[3px]">
            {group.items.map(({ href, label, icon: Icon }) => {
              const active = isActive(pathname, href);
              return (
                <Link
                  key={`${group.label}-${href}-${label}`}
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={`group relative flex min-h-[35px] items-center gap-[11px] rounded-[7px] px-3 py-[9px] text-[12px] transition ${
                    active
                      ? 'bg-[#EAF4ED] font-semibold text-[#216551]'
                      : 'font-medium text-[#64746C] hover:bg-[#F3F6F3] hover:text-[#216551]'
                  }`}
                >
                  {active ? (
                    <span
                      className="absolute -left-[13px] inset-y-2 w-[3px] rounded-r bg-[#216551]"
                      aria-hidden="true"
                    />
                  ) : null}
                  <Icon size={16} className={active ? 'text-[#216551]' : 'text-[#809288]'} />
                  <span>{label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

export function CrmNavigation() {
  const pathname = usePathname();
  const current = groups
    .flatMap((group) => group.items)
    .find((item) => isActive(pathname, item.href));

  return (
    <>
      <details className="group rounded-[9px] border border-[#E4EAE6] bg-white min-[881px]:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-[12px] font-semibold text-[#192E29] [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2.5">
            <span className="grid h-[30px] w-[30px] place-items-center rounded-[8px] border border-[#DCE5DE] bg-[#EDF2EF] text-[#335642]">
              <Activity size={15} />
            </span>
            {current?.label || 'CRM Operations'}
          </span>
          <ChevronDown size={15} className="text-[#809288] transition group-open:rotate-180" />
        </summary>
        <div className="border-t border-[#E4EAE6] px-3 pb-4 pt-3">
          <div className="mb-4 rounded-[9px] border border-[#E4EAE6] px-3 py-2.5">
            <div className="text-[11px] font-bold text-[#192E29]">CRM Operations</div>
            <div className="mt-0.5 text-[9px] text-[#6D7C76]">Sales workspace</div>
          </div>
          <Links />
        </div>
      </details>

      <aside className="hidden min-h-[calc(100vh-7rem)] border-r border-[#E4EAE6] pr-4 min-[881px]:block">
        <div className="sticky top-20 pb-8">
          <div className="mb-5 rounded-[9px] border border-[#E4EAE6] p-[10px]">
            <div className="flex items-center gap-[10px]">
              <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[8px] border border-[#DCE5DE] bg-[#EDF2EF] text-[10px] font-bold text-[#335642]">
                CRM
              </span>
              <div className="min-w-0">
                <div className="truncate text-[11px] font-bold text-[#192E29]">CRM Operations</div>
                <div className="mt-0.5 text-[9px] text-[#6D7C76]">Sales workspace</div>
              </div>
            </div>
          </div>
          <Links />
        </div>
      </aside>
    </>
  );
}
