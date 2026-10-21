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
          <div className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-[0.17em] text-slate-400">
            {group.label}
          </div>
          <div className="space-y-0.5">
            {group.items.map(({ href, label, icon: Icon }) => {
              const active = isActive(pathname, href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold transition ${
                    active
                      ? 'bg-violet-50 text-violet-700 shadow-[inset_0_0_0_1px_rgba(124,58,237,0.08)]'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'
                  }`}
                >
                  <Icon
                    size={17}
                    className={
                      active
                        ? 'text-violet-600'
                        : 'text-slate-400 transition group-hover:text-slate-600'
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
      <details className="group rounded-2xl border border-slate-200 bg-white shadow-sm lg:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 text-sm font-semibold text-slate-900 [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-violet-50 text-violet-700">
              <Workflow size={16} />
            </span>
            {current?.label || 'Automation'}
          </span>
          <ChevronDown size={16} className="text-slate-400 transition group-open:rotate-180" />
        </summary>
        <div className="border-t border-slate-100 p-3">
          <div className="mb-4 rounded-xl bg-slate-50 px-3 py-2.5">
            <div className="text-sm font-bold text-slate-950">Automation</div>
            <div className="mt-0.5 text-xs text-slate-500">Build, govern and monitor safe messaging workflows.</div>
          </div>
          <NavigationLinks mobile />
        </div>
      </details>

      <aside className="hidden min-h-[calc(100vh-7rem)] border-r border-slate-200 pr-4 lg:block">
        <div className="sticky top-20 pb-8">
          <div className="mb-6 px-3 pt-1">
            <div className="text-[15px] font-bold text-slate-950">Automation</div>
            <p className="mt-1 max-w-[180px] text-xs leading-5 text-slate-500">
              Build, govern and monitor safe messaging workflows.
            </p>
          </div>
          <NavigationLinks />
        </div>
      </aside>
    </>
  );
}
