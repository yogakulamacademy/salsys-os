'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Gauge,
  GitBranch,
  Globe2,
  LineChart,
  Link2,
  Megaphone,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  UsersRound,
  Target,
} from 'lucide-react';

type NavigationItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  badge?: string;
};

type NavigationGroup = {
  label: string;
  items: NavigationItem[];
};

const groups: NavigationGroup[] = [
  {
    label: 'Overview',
    items: [
      { href: '/marketing', label: 'Growth Command Center', icon: Gauge },
    ],
  },
  {
    label: 'Paid acquisition',
    items: [
      { href: '/campaigns', label: 'Campaigns', icon: Megaphone },
      { href: '/paid-media-leads', label: 'Acquisition', icon: UsersRound },
      { href: '/re-engaged', label: 'Re-engaged Leads', icon: Activity },
      { href: '/marketing/audiences', label: 'Audience Intelligence', icon: Target, badge: 'Simulation' },
    ],
  },
  {
    label: 'Organic discovery',
    items: [
      { href: '/seo', label: 'SEO Overview', icon: Globe2 },
      { href: '/seo/search-performance', label: 'Search Performance', icon: Search },
      { href: '/seo/content-opportunities', label: 'Content Opportunities', icon: Sparkles },
      { href: '/seo/technical', label: 'Technical SEO', icon: ShieldCheck },
      { href: '/seo/ai-answer-visibility', label: 'AI Answer Visibility', icon: Sparkles, badge: 'Preview' },
    ],
  },
  {
    label: 'Performance',
    items: [
      { href: '/analytics', label: 'Analytics', icon: LineChart },
      { href: '/funnel', label: 'Funnel', icon: GitBranch },
      { href: '/attribution', label: 'Attribution', icon: Link2 },
      { href: '/revenue', label: 'Revenue', icon: CircleDollarSign },
    ],
  },
  {
    label: 'Measurement',
    items: [
      { href: '/tracking', label: 'Tracking', icon: Globe2 },
      { href: '/tracking/conversion-health', label: 'Conversion Health', icon: CheckCircle2 },
      { href: '/tracking/data-coverage', label: 'Data Coverage', icon: ShieldCheck },
    ],
  },
  {
    label: 'Configuration',
    items: [
      { href: '/marketing/integrations', label: 'Marketing Integrations', icon: Link2 },
      { href: '/marketing/tracking-sources', label: 'Tracking Sources', icon: Settings2 },
    ],
  },
];

function isActive(pathname: string, href: string) {
  if (href === '/seo') return pathname === '/seo';
  if (href === '/tracking') return pathname === '/tracking';
  return pathname === href || pathname.startsWith(`${href}/`);
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
            {group.items.map(({ href, label, icon: Icon, badge }) => {
              const active = isActive(pathname, href);

              return (
                <Link
                  key={href}
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
                  {badge ? (
                    <span className="rounded-full border border-line bg-surface-soft px-2 py-0.5 text-[10px] font-medium text-copy-muted">
                      {badge}
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

export function MarketingNavigation() {
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
              <BarChart3 size={16} />
            </span>
            {current?.label || 'Growth'}
          </span>
          <ChevronDown size={16} className="text-copy-subtle transition group-open:rotate-180" />
        </summary>
        <div className="border-t border-line p-3">
          <div className="mb-4 rounded-ui bg-surface-soft px-3 py-3">
            <div className="text-sm font-semibold text-copy-strong">Growth</div>
            <div className="mt-1 text-[13px] leading-5 text-copy-muted">
              Connect acquisition, conversion and revenue in one growth workspace.
            </div>
          </div>
          <NavigationLinks mobile />
        </div>
      </details>

      <aside className="hidden min-h-[calc(100vh-7rem)] border-r border-line pr-4 lg:block" aria-label="Growth navigation">
        <div className="sticky top-20 pb-8">
          <div className="mb-7 px-3 pt-1">
            <div className="text-[18px] font-semibold tracking-[-0.025em] text-copy-strong">
              Growth
            </div>
            <p className="mt-1.5 max-w-[195px] text-[13px] leading-5 text-copy-muted">
              Connect acquisition, conversion and revenue in one growth workspace.
            </p>
          </div>
          <NavigationLinks />
        </div>
      </aside>
    </>
  );
}
