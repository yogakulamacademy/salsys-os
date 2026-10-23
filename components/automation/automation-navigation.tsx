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

function NavigationLinks() {
  const pathname = usePathname();

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <div key={group.label}>
          <div className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--app-text-subtle)]">
            {group.label}
          </div>
          <div className="space-y-1">
            {group.items.map(({ href, label, icon: Icon }) => {
              const active = isActive(pathname, href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`group relative flex min-h-10 items-center gap-3 rounded-[10px] px-3 py-2.5 text-[13px] transition ${
                    active
                      ? 'bg-[var(--app-brand-50)] font-semibold text-[var(--app-brand-700)]'
                      : 'font-medium text-[var(--app-text-muted)] hover:bg-[var(--app-surface-muted)] hover:text-[var(--app-text-strong)]'
                  }`}
                >
                  {active ? (
                    <span className="absolute -left-[17px] h-5 w-[3px] rounded-r-full bg-[var(--app-brand-700)]" />
                  ) : null}
                  <Icon
                    size={17}
                    className={
                      active
                        ? 'text-[var(--app-brand-700)]'
                        : 'text-[var(--app-text-subtle)] transition group-hover:text-[var(--app-brand-700)]'
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
      <details className="group rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] lg:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 text-[14px] font-semibold text-[var(--app-text-strong)] [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--app-brand-50)] text-[var(--app-brand-700)]">
              <Workflow size={17} />
            </span>
            {current?.label || 'Automation'}
          </span>
          <ChevronDown
            size={16}
            className="text-[var(--app-text-subtle)] transition group-open:rotate-180"
          />
        </summary>
        <div className="border-t border-[var(--app-border)] p-3">
          <div className="mb-5 rounded-xl bg-[var(--app-surface-soft)] px-3.5 py-3">
            <div className="text-[16px] font-semibold text-[var(--app-text-strong)]">Automation</div>
            <div className="mt-1 text-[13px] leading-5 text-[var(--app-text-muted)]">
              Build, govern and monitor reliable messaging workflows.
            </div>
          </div>
          <NavigationLinks />
        </div>
      </details>

      <aside className="hidden min-h-[calc(100vh-7rem)] border-r border-[var(--app-border)] pr-5 lg:block">
        <div className="sticky top-20 pb-10">
          <div className="mb-7 px-3 pt-1">
            <div className="text-[18px] font-semibold tracking-[-0.02em] text-[var(--app-text-strong)]">Automation</div>
            <p className="mt-1.5 max-w-[205px] text-[13px] leading-5 text-[var(--app-text-muted)]">
              Build, govern and monitor reliable messaging workflows.
            </p>
          </div>
          <NavigationLinks />
        </div>
      </aside>
    </>
  );
}
