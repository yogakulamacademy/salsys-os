'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  BarChart3,
  ChevronDown,
  FileSearch,
  GitBranch,
  Instagram,
  LayoutDashboard,
  ListChecks,
  LockKeyhole,
  MessageCircleMore,
  MessageSquareText,
  Settings2,
  ShieldCheck,
  Sparkles,
  Workflow,
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
      { href: '/automation', label: 'Overview', icon: LayoutDashboard },
      { href: '/automation/flow-builder', label: 'Flow builder', icon: Workflow },
      { href: '/automation/triggers', label: 'Smart triggers', icon: GitBranch },
      { href: '/automation/recipes', label: 'Starter recipes', icon: Sparkles },
    ],
  },
  {
    label: 'Channels',
    items: [
      { href: '/automation/whatsapp', label: 'WhatsApp ops', icon: MessageCircleMore },
      { href: '/automation/templates', label: 'WhatsApp templates', icon: MessageSquareText },
      { href: '/automation/whatsapp/growth', label: 'WhatsApp growth', icon: BarChart3 },
      { href: '/automation/instagram', label: 'Instagram ops', icon: Instagram },
    ],
  },
  {
    label: 'Governance',
    items: [
      { href: '/automation/approvals', label: 'Approval queue', icon: ListChecks },
      { href: '/automation/pilot', label: 'Pilot control', icon: LockKeyhole },
      { href: '/automation/readiness', label: 'Launch readiness', icon: ShieldCheck },
    ],
  },
  {
    label: 'Observability',
    items: [
      { href: '/automation/runs', label: 'Runtime monitor', icon: Activity },
      { href: '/automation/audits', label: 'Provider & audit', icon: FileSearch },
    ],
  },
  {
    label: 'Settings',
    items: [{ href: '/automation/settings', label: 'Automation settings', icon: Settings2 }],
  },
];

function isActive(pathname: string, href: string) {
  if (href === '/automation') return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavigationLinks({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname();

  return (
    <div className={mobile ? 'space-y-5' : 'space-y-5'}>
      {groups.map((group) => (
        <div key={group.label}>
          <div className="mb-1.5 px-3 text-[9px] font-bold uppercase tracking-[0.16em] text-[#8a9790]">
            {group.label}
          </div>
          <div className="space-y-0.5">
            {group.items.map(({ href, label, icon: Icon }) => {
              const active = isActive(pathname, href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`group relative flex items-center gap-2.5 rounded-[7px] px-3 py-2.5 text-[12px] transition ${
                    active
                      ? 'bg-[#eaf4ed] font-semibold text-[#216551]'
                      : 'font-medium text-[#64746c] hover:bg-[#f3f6f3] hover:text-[#216551]'
                  }`}
                >
                  {active ? <span className="absolute -left-4 h-[18px] w-[3px] rounded-r bg-[#216551]" /> : null}
                  <Icon
                    size={16}
                    className={
                      active
                        ? 'text-[#216551]'
                        : 'text-[#91a096] transition group-hover:text-[#216551]'
                    }
                  />
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

export function AutomationNavigation() {
  const pathname = usePathname();
  const current = groups
    .flatMap((group) => group.items)
    .find((item) => isActive(pathname, item.href));

  return (
    <>
      <details className="group rounded-xl border border-[#e4eae6] bg-white lg:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 text-sm font-semibold text-[#192e29] [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#eaf4ed] text-[#216551]">
              <Workflow size={16} />
            </span>
            {current?.label || 'Automation'}
          </span>
          <ChevronDown size={16} className="text-[#91a096] transition group-open:rotate-180" />
        </summary>
        <div className="border-t border-[#e4eae6] p-3">
          <div className="mb-4 rounded-lg bg-[#f6f8f7] px-3 py-2.5">
            <div className="text-sm font-bold text-[#192e29]">Automation</div>
            <div className="mt-0.5 text-xs leading-5 text-[#6d7c76]">Build, govern and monitor reliable messaging workflows.</div>
          </div>
          <NavigationLinks mobile />
        </div>
      </details>

      <aside className="hidden min-h-[calc(100vh-7rem)] border-r border-[#e4eae6] pr-4 lg:block">
        <div className="sticky top-20 pb-8">
          <div className="mb-6 px-3 pt-1">
            <div className="text-[15px] font-bold text-[#192e29]">Automation</div>
            <p className="mt-1 max-w-[185px] text-[11px] leading-5 text-[#6d7c76]">
              Build, govern and monitor reliable messaging workflows.
            </p>
          </div>
          <NavigationLinks />
        </div>
      </aside>
    </>
  );
}
