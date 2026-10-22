"use client";

import Link from "next/link";
import { Activity, ArrowRight, DatabaseZap, HeartPulse, ShieldCheck } from "lucide-react";
import { usePathname } from "next/navigation";

const ITEMS = [
  {
    href: "/tracking",
    label: "Tracking Health",
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
] as const;

export function MeasurementControlNav() {
  const pathname = usePathname();

  return (
    <section className="mb-4 overflow-hidden rounded-[16px] border border-slate-200 bg-white/95 shadow-[0_10px_30px_rgba(20,43,35,.035)] backdrop-blur">
      <div className="flex flex-col gap-3 border-b border-slate-100 bg-[linear-gradient(110deg,#f8fbf8_0%,#ffffff_58%,#f7f3fa_100%)] px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="grid h-8 w-8 place-items-center rounded-lg border border-[#d5e4da] bg-white text-[#216551] shadow-[0_2px_6px_rgba(20,43,35,.04)]">
            <DatabaseZap size={15} />
          </span>
          <div>
            <div className="text-[9px] font-black uppercase tracking-[0.14em] text-[#216551]">Measurement control plane</div>
            <div className="mt-0.5 text-[10px] text-slate-500">From browser signal to trusted commercial evidence.</div>
          </div>
        </div>
        <Link href="/marketing/integrations" className="inline-flex items-center gap-1 text-[10px] font-black text-[#216551] hover:underline">
          Manage integrations <ArrowRight size={11} />
        </Link>
      </div>

      <nav className="grid gap-px bg-slate-100 sm:grid-cols-3" aria-label="Measurement workspace">
        {ITEMS.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group flex items-center gap-3 bg-white px-4 py-3 transition ${
                active ? "relative text-[#153d33]" : "text-slate-500 hover:bg-[#f8faf5] hover:text-slate-800"
              }`}
            >
              {active ? <span className="absolute inset-x-0 top-0 h-[2px] bg-[#216551]" /> : null}
              <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${active ? "bg-[#edf5e9] text-[#216551]" : "bg-slate-50 text-slate-400 group-hover:text-[#216551]"}`}>
                <Icon size={13} />
              </span>
              <span className="min-w-0">
                <span className="block text-[10px] font-black">{item.label}</span>
                <span className="mt-0.5 block truncate text-[9px] text-slate-400">{item.detail}</span>
              </span>
            </Link>
          );
        })}
      </nav>
    </section>
  );
}
