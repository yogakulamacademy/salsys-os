'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  ChevronDown,
  FileSearch,
  GitBranch,
  LineChart,
  Megaphone,
  Target,
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
    label: 'Paid growth',
    items: [
      { href: '/campaigns', label: 'Campaigns', icon: Target },
      { href: '/paid-media-leads', label: 'Paid media leads', icon: UsersRound },
      { href: '/re-engaged', label: 'Lead activity', icon: Activity },
    ],
  },
  {
    label: 'Organic growth',
    items: [{ href: '/seo', label: 'SEO / AEO', icon: FileSearch }],
  },
  {
    label: 'Analysis',
    items: [
      { href: '/attribution', label: 'Attribution', icon: LineChart },
      { href: '/funnel', label: 'Funnels', icon: GitBranch },
    ],
  },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavigationLinks({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname();

  return (
    <div className={mobile ? 'space-y-5' : 'space-y-6'}>
      {groups.map((group) => (
        <section key={group.label}>
          <div className="mb-1.5 px-3 text-[9px] font-bold uppercase tracking-[0.17em] text-[#8a9790]">
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
      <details className="group rounded-xl border border-[#e4eae6] bg-white lg:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 text-sm font-semibold text-[#192e29] [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#eaf4ed] text-[#216551]">
              <Megaphone size={16} />
            </span>
            {current?.label || 'Marketing'}
          </span>
          <ChevronDown size={16} className="text-[#91a096] transition group-open:rotate-180" />
        </summary>
        <div className="border-t border-[#e4eae6] p-3">
          <div className="mb-4 rounded-lg bg-[#f6f8f7] px-3 py-2.5">
            <div className="text-sm font-bold text-[#192e29]">Marketing</div>
            <div className="mt-0.5 text-xs leading-5 text-[#6d7c76]">
              Understand acquisition, campaign performance and customer growth.
            </div>
          </div>
          <NavigationLinks mobile />
        </div>
      </details>

      <aside className="hidden min-h-[calc(100vh-7rem)] border-r border-[#e4eae6] pr-4 lg:block">
        <div className="sticky top-20 pb-8">
          <div className="mb-7 px-3 pt-1">
            <div className="text-[17px] font-bold tracking-[-0.02em] text-[#192e29]">Marketing</div>
            <p className="mt-1 max-w-[190px] text-[11px] leading-5 text-[#6d7c76]">
              Understand acquisition, campaign performance and customer growth.
            </p>
          </div>
          <NavigationLinks />
        </div>
      </aside>
    </>
  );
}
