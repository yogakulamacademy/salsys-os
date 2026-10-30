"use client";

import Link from "next/link";
import { Activity, ArrowRight, DatabaseZap, HeartPulse, ShieldCheck } from "lucide-react";
import { usePathname } from "next/navigation";

const ITEMS = [
  {
    href: "/tracking",
    label: "Tracking & Data",
    detail: "Collector · identity · capture",
    icon: Activity,
  },
  {
    href: "/tracking/conversion-health",
    label: "Conversion Health",
    detail: "Event → CRM reconciliation",
    icon: HeartPulse,
  },
  {
    href: "/tracking/data-coverage",
    label: "Data Coverage",
    detail: "Known · Partial · Unknown",
    icon: ShieldCheck,
  },
  {
    href: "/tracking/sources",
    label: "Sources",
    detail: "Browser · server · integrations",
    icon: DatabaseZap,
  },
] as const;

export function MeasurementControlNav() {
  const pathname = usePathname();

  return (
    <section className="mb-4 overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
      <div className="flex flex-col gap-3 border-b border-line bg-[linear-gradient(110deg,var(--app-brand-50)_0%,var(--app-surface)_58%,var(--app-surface-soft)_100%)] px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-surface text-brand-700 shadow-sm">
            <DatabaseZap size={15} />
          </span>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-700">Measurement control plane</div>
            <div className="mt-0.5 text-[11px] text-copy-muted">From browser signal to trusted commercial evidence.</div>
          </div>
        </div>
        <Link href="/settings/integrations" className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-700 hover:underline">
          Manage integrations <ArrowRight size={11} />
        </Link>
      </div>

      <nav className="grid gap-px bg-line sm:grid-cols-2 xl:grid-cols-4" aria-label="Measurement workspace">
        {ITEMS.map((item) => {
          const active = pathname === item.href || (item.href !== "/tracking" && pathname.startsWith(`${item.href}/`));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group relative flex items-center gap-3 bg-surface px-4 py-3 transition ${
                active ? "text-copy-strong" : "text-copy-muted hover:bg-surface-muted hover:text-copy-strong"
              }`}
            >
              {active ? <span className="absolute inset-x-0 top-0 h-[2px] bg-brand-700" /> : null}
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${active ? "bg-brand-50 text-brand-700" : "bg-surface-muted text-copy-subtle group-hover:text-brand-700"}`}>
                <Icon size={14} />
              </span>
              <span className="min-w-0">
                <span className="block text-[11px] font-semibold">{item.label}</span>
                <span className="mt-0.5 block truncate text-[10px] text-copy-subtle">{item.detail}</span>
              </span>
            </Link>
          );
        })}
      </nav>
    </section>
  );
}
