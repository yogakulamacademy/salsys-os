'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import {
  BarChart3,
  ChevronDown,
  Gauge,
  Globe2,
  Megaphone,
  Search,
  ShieldCheck,
  UsersRound,
} from 'lucide-react';

// Marketing menu (owner-approved revamp, 25 Nov 2026): 6 pages instead of 18
// links and 8 tabs. Each page lists its own sub-pages underneath it while it is
// open. Integrations live in Settings; Revenue has its own workspace.

type Where = { path: string; view: string | null };
type SubItem = { href: string; label: string };
type NavigationItem = {
  key: string;
  href: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  match: (where: Where) => boolean;
  subs?: SubItem[];
};

const under = (path: string, base: string) => path === base || path.startsWith(`${base}/`);

const items: NavigationItem[] = [
  {
    key: 'overview', href: '/marketing', label: 'Overview', icon: Gauge,
    description: 'What’s bringing enquiries and what’s broken',
    match: ({ path, view }) => path === '/marketing' && (!view || view === 'overview'),
  },
  {
    key: 'sources', href: '/marketing?view=funnel', label: 'Where enquiries come from', icon: UsersRound,
    description: 'How far enquiries from each source get',
    match: ({ path, view }) => (path === '/marketing' && (view === 'funnel' || view === 'attribution'))
      || under(path, '/funnel') || under(path, '/attribution') || under(path, '/paid-media-leads'),
    subs: [
      { href: '/marketing?view=funnel', label: 'Stage by stage' },
      { href: '/marketing?view=attribution', label: 'Credit by source' },
      { href: '/paid-media-leads', label: 'Enquiries from ads' },
    ],
  },
  {
    key: 'ads', href: '/marketing?view=campaigns', label: 'Ads', icon: Megaphone,
    description: 'Meta and Google campaigns, spend, results',
    match: ({ path, view }) => (path === '/marketing' && view === 'campaigns') || under(path, '/campaigns'),
  },
  {
    key: 'website', href: '/marketing?view=analytics', label: 'Website', icon: BarChart3,
    description: 'Visits, pages and forms',
    match: ({ path, view }) => (path === '/marketing' && (view === 'analytics' || view === 'behavior')) || under(path, '/analytics'),
    subs: [
      { href: '/marketing?view=analytics', label: 'Visits and sources' },
      { href: '/marketing?view=behavior', label: 'Clicks and forms' },
    ],
  },
  {
    key: 'search', href: '/seo', label: 'Google search', icon: Search,
    description: 'Clicks, searches to target, page fixes',
    match: ({ path }) => under(path, '/seo'),
    subs: [
      { href: '/seo', label: 'Overview' },
      { href: '/seo/intelligence', label: 'Insights' },
      { href: '/seo/search-performance', label: 'Searches and pages' },
      { href: '/seo/content-opportunities', label: 'Content ideas' },
      { href: '/seo/technical', label: 'Technical checks' },
      { href: '/seo/ai-answer-visibility', label: 'AI answers' },
    ],
  },
  {
    key: 'tracking', href: '/tracking', label: 'Tracking check', icon: ShieldCheck,
    description: 'Is every source still sending data?',
    match: ({ path }) => under(path, '/tracking') || under(path, '/marketing/tracking-sources') || under(path, '/marketing/integrations'),
    subs: [
      { href: '/tracking', label: 'Overview' },
      { href: '/tracking/conversion-health', label: 'Form and lead matching' },
      { href: '/tracking/data-coverage', label: 'Data coverage' },
      { href: '/marketing/tracking-sources', label: 'Tracking sources' },
    ],
  },
];

function subActive(where: Where, href: string) {
  const [path, query] = href.split('?');
  const view = query ? new URLSearchParams(query).get('view') : null;
  if (view) return where.path === path && where.view === view;
  return where.path === path;
}

function NavigationLinks({ where }: { where: Where }) {
  return (
    <div className="space-y-1">
      {items.map((item) => {
        const active = item.match(where);
        const Icon = item.icon;
        return (
          <div key={item.key}>
            <Link
              href={item.href}
              aria-current={active && !item.subs ? 'page' : undefined}
              className={`group relative flex min-h-10 items-start gap-2.5 rounded-ui px-3 py-2.5 transition ${
                active ? 'bg-brand-50' : 'hover:bg-surface-muted'
              }`}
            >
              {active ? <span className="absolute -left-4 top-3 h-5 w-[3px] rounded-r bg-brand-700" /> : null}
              <Icon size={16} className={`mt-0.5 shrink-0 ${active ? 'text-brand-700' : 'text-copy-subtle group-hover:text-brand-700'}`} />
              <span className="min-w-0">
                <span className={`block text-[13.5px] ${active ? 'font-bold text-brand-700' : 'font-semibold text-copy-strong'}`}>{item.label}</span>
                <span className="block text-[11.5px] leading-4 text-copy-muted">{item.description}</span>
              </span>
            </Link>
            {active && item.subs ? (
              <div className="mb-1 ml-[30px] mt-1 space-y-0.5 border-l border-line pl-2.5">
                {item.subs.map((sub) => {
                  const on = subActive(where, sub.href);
                  return (
                    <Link
                      key={sub.href}
                      href={sub.href}
                      aria-current={on ? 'page' : undefined}
                      className={`block rounded-lg px-2.5 py-1.5 text-[12.5px] ${on ? 'bg-surface-muted font-bold text-copy-strong' : 'font-medium text-copy-muted hover:text-copy-strong'}`}
                    >
                      {sub.label}
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function NavigationBody({ where }: { where: Where }) {
  const current = items.find((item) => item.match(where));
  return (
    <>
      <details className="group rounded-panel border border-line bg-surface lg:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 text-sm font-semibold text-copy-strong [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-ui bg-brand-50 text-brand-700">
              <BarChart3 size={16} />
            </span>
            {current?.label || 'Marketing'}
          </span>
          <ChevronDown size={16} className="text-copy-subtle transition group-open:rotate-180" />
        </summary>
        <div className="border-t border-line p-3">
          <NavigationLinks where={where} />
        </div>
      </details>

      <aside
        className="sticky top-16 hidden h-[calc(100vh-4rem)] self-start overflow-y-auto overflow-x-hidden overscroll-contain border-r border-line pr-4 lg:block [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label="Marketing navigation"
      >
        <div className="flex min-h-full flex-col pb-6 pt-4">
          <div className="mb-5 px-3 pt-1">
            <div className="text-[18px] font-semibold tracking-[-0.025em] text-copy-strong">Marketing</div>
            <p className="mt-1.5 max-w-[195px] text-[13px] leading-5 text-copy-muted">
              Where enquiries come from and what they cost.
            </p>
          </div>
          <NavigationLinks where={where} />
          <div className="mt-auto border-t border-line px-3 pt-4 text-[12px] leading-5 text-copy-muted">
            <Link href="/settings/integrations" className="inline-flex items-center gap-1.5 font-semibold text-copy-strong hover:text-brand-700">
              <Globe2 size={13} /> Connections
            </Link>
            <span className="block">Meta, Google, Instagram and website tracking are connected in Settings.</span>
          </div>
        </div>
      </aside>
    </>
  );
}

function WithSearchParams() {
  const path = usePathname();
  const params = useSearchParams();
  return <NavigationBody where={{ path, view: params.get('view') }} />;
}

function PathOnly() {
  const path = usePathname();
  return <NavigationBody where={{ path, view: null }} />;
}

export function MarketingNavigation() {
  return (
    <Suspense fallback={<PathOnly />}>
      <WithSearchParams />
    </Suspense>
  );
}
