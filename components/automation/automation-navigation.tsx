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
    items: [{ href: '/automation', label: 'Overview', icon: LayoutDashboard }],
  },
  {
    label: 'Build',
    items: [
      { href: '/automation/flow-builder', label: 'Flows', icon: Workflow },
      { href: '/automation/triggers', label: 'Smart Triggers', icon: GitBranch },
      { href: '/automation/recipes', label: 'Starter Recipes', icon: Sparkles },
    ],
  },
  {
    label: 'Messaging',
    items: [
      { href: '/automation/whatsapp', label: 'WhatsApp Ops', icon: MessageCircleMore },
      { href: '/automation/templates', label: 'WhatsApp Templates', icon: MessageSquareText },
      { href: '/automation/whatsapp/growth', label: 'WhatsApp Growth', icon: BarChart3 },
      { href: '/automation/instagram', label: 'Instagram Ops', icon: Instagram },
    ],
  },
  {
    label: 'Governance',
    items: [
      { href: '/automation/approvals', label: 'Approval Queue', icon: ListChecks },
      { href: '/automation/pilot', label: 'Controlled Rollout', icon: LockKeyhole },
      { href: '/automation/readiness', label: 'Launch Readiness', icon: ShieldCheck },
    ],
  },
  {
    label: 'Monitoring',
    items: [
      { href: '/automation/runs', label: 'Execution Monitor', icon: Activity },
      { href: '/automation/audits', label: 'Provider Health', icon: FileSearch },
    ],
  },
  {
    label: 'System',
    items: [{ href: '/automation/settings', label: 'Settings', icon: Settings2 }],
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
          <div className="mb-1.5 px-2 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">
            {group.label}
          </div>
          <div className="space-y-0.5">
            {group.items.map(({ href, label, icon: Icon }) => {
              const active = isActive(pathname, href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-medium transition ${
                    active
                      ? 'bg-violet-50 text-violet-800 ring-1 ring-inset ring-violet-100'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'
                  }`}
                >
                  <Icon size={16} className={active ? 'text-violet-600' : 'text-slate-400'} />
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
      <details className="group rounded-2xl border border-slate-200 bg-white lg:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-slate-900 [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2">
            <Workflow size={16} className="text-violet-600" />
            {current?.label || 'Automation'}
          </span>
          <ChevronDown size={16} className="text-slate-400 transition group-open:rotate-180" />
        </summary>
        <div className="border-t border-slate-100 p-3">
          <NavigationLinks mobile />
        </div>
      </details>

      <aside className="hidden lg:block">
        <div className="sticky top-20 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="mb-5 px-2 pt-1">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-950">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-violet-50 text-violet-700">
                <Workflow size={15} />
              </span>
              Automation
            </div>
            <p className="mt-1.5 text-xs leading-5 text-slate-500">Build, govern and monitor messaging workflows.</p>
          </div>
          <NavigationLinks />
        </div>
      </aside>
    </>
  );
}
