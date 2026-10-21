'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ChevronDown,
  LayoutDashboard,
  ListTodo,
  Rows3,
  UserRoundSearch,
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
      { href: '/admissions', label: 'Admissions Desk', icon: LayoutDashboard },
      { href: '/leads', label: 'Leads', icon: UserRoundSearch },
      { href: '/pipeline', label: 'Pipeline', icon: Rows3 },
    ],
  },
  {
    label: 'Actions',
    items: [{ href: '/follow-ups', label: 'Follow-ups', icon: ListTodo }],
  },
];

function isActive(pathname: string, href: string) {
  if (href === '/leads') return pathname === '/leads' || pathname.startsWith('/leads/');
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Links() {
  const pathname = usePathname();

  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <div key={group.label}>
          <div className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-[#8A978F]">
            {group.label}
          </div>
          <div className="space-y-0.5">
            {group.items.map(({ href, label, icon: Icon }) => {
              const active = isActive(pathname, href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`group relative flex min-h-9 items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition ${
                    active
                      ? 'bg-[#EAF4ED] text-[#216551]'
                      : 'text-[#64746C] hover:bg-[#F3F6F3] hover:text-[#216551]'
                  }`}
                >
                  {active ? (
                    <span className="absolute -left-4 inset-y-2 w-[3px] rounded-r bg-[#216551]" aria-hidden="true" />
                  ) : null}
                  <Icon size={17} className={active ? 'text-[#216551]' : 'text-[#86968D]'} />
                  <span>{label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export function CrmNavigation() {
  const pathname = usePathname();
  const current = groups.flatMap((group) => group.items).find((item) => isActive(pathname, item.href));

  return (
    <>
      <details className="group rounded-xl border border-[#E4EAE6] bg-white lg:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-[#192E29] [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#EAF4ED] text-[#216551]">
              <UserRoundSearch size={16} />
            </span>
            {current?.label || 'CRM Operations'}
          </span>
          <ChevronDown size={16} className="text-[#7D8D84] transition group-open:rotate-180" />
        </summary>
        <div className="border-t border-[#E4EAE6] p-3">
          <div className="mb-4 rounded-lg bg-[#F6F8F7] px-3 py-2.5">
            <div className="text-sm font-semibold text-[#192E29]">CRM Operations</div>
            <div className="mt-0.5 text-xs leading-5 text-[#6D7C76]">Find, prioritize and move customer opportunities forward.</div>
          </div>
          <Links />
        </div>
      </details>

      <aside className="hidden min-h-[calc(100vh-7rem)] border-r border-[#E4EAE6] pr-4 lg:block">
        <div className="sticky top-20 pb-8">
          <div className="mb-6 px-3 pt-1">
            <div className="text-[15px] font-semibold text-[#192E29]">CRM Operations</div>
            <p className="mt-1 max-w-[190px] text-xs leading-5 text-[#6D7C76]">
              Leads, admissions decisions and pipeline movement in one workspace.
            </p>
          </div>
          <Links />
        </div>
      </aside>
    </>
  );
}
