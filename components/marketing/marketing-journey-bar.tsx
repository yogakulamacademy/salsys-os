import Link from "next/link";
import { BarChart3, GitBranch, Search, Target, UsersRound } from "lucide-react";

const items = [
  { href: "/campaigns", label: "Campaigns", icon: BarChart3 },
  { href: "/paid-media-leads", label: "Acquisition", icon: UsersRound },
  { href: "/funnel", label: "Funnel", icon: GitBranch },
  { href: "/attribution", label: "Attribution", icon: Target },
  { href: "/seo", label: "Search Intelligence", icon: Search },
];

export function MarketingJourneyBar() {
  return (
    <section className="mb-4 rounded-2xl border border-line bg-surface px-4 py-3 shadow-sm sm:px-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="text-[9px] font-black uppercase tracking-[.14em] text-copy-subtle">Marketing decision path</div>
          <p className="mt-1 text-[11px] leading-5 text-copy-muted">
            Move from spend and acquisition evidence into conversion, attribution and organic search without leaving the marketing workflow.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {items.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className="btn-secondary">
              <Icon size={14} /> {label}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
