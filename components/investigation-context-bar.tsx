"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, CircleDollarSign, GitBranch, Target, X } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";

export function InvestigationContextBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const active = searchParams.get("investigation") === "1";
  const source = searchParams.get("source")?.trim() || "Marketing evidence";
  const from = searchParams.get("from")?.trim() || "marketing";

  const visible = active && (pathname === "/revenue" || /^\/leads\/[^/]+$/.test(pathname));
  if (!visible) return null;

  const encodedSource = encodeURIComponent(source);
  const attributionHref = `/attribution?q=${encodedSource}`;
  const funnelHref = "/funnel";
  const campaignHref = `/campaigns?q=${encodedSource}`;
  const revenueHref = `/revenue?investigation=1&source=${encodedSource}&from=${encodeURIComponent(from)}`;

  return (
    <section className="mb-4 overflow-hidden rounded-2xl border border-[#d5e2d7] bg-[linear-gradient(135deg,#f4f8f3_0%,#fbfcfa_62%,#eef6f0_100%)] shadow-[0_12px_32px_rgba(16,45,39,.045)]">
      <div className="flex flex-col gap-4 px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-[#cfe0d5] bg-white/80 px-2 py-1 text-[8px] font-black uppercase tracking-[.11em] text-[#527263]">Investigation active</span>
            <span className="text-[9px] font-semibold text-[#8a978a]">from {pretty(from)}</span>
          </div>
          <div className="mt-2 text-sm font-semibold tracking-[-.015em] text-[#102d27]">Following “{source}” across marketing → revenue → CRM</div>
          <p className="mt-1 max-w-3xl text-[10px] leading-5 text-[#758279]">
            SalsysOS is preserving the evidence thread while you move between attribution, commercial outcomes and individual customer records. The context is navigational only; it does not change or infer the underlying data.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link href={attributionHref} className="btn-secondary"><ArrowLeft size={13} /> Attribution</Link>
          <Link href={campaignHref} className="btn-secondary"><Target size={13} /> Campaigns</Link>
          <Link href={funnelHref} className="btn-secondary"><GitBranch size={13} /> Funnel</Link>
          {pathname !== "/revenue" ? <Link href={revenueHref} className="btn-secondary"><CircleDollarSign size={13} /> Revenue</Link> : null}
          <Link href={pathname} className="btn-secondary" title="Clear investigation context"><X size={13} /> Clear</Link>
        </div>
      </div>
      <div className="flex items-center gap-2 border-t border-[#e1e9e2] bg-white/45 px-4 py-2.5 text-[9px] font-semibold text-[#62766b] sm:px-5">
        <ArrowRight size={11} /> Evidence path remains explicit; unknown attribution and missing commercial values stay unknown.
      </div>
    </section>
  );
}

function pretty(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
