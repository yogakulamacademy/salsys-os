"use client";

import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  CircleDollarSign,
  GitBranch,
  Target,
  X,
} from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import {
  METRIC_INVESTIGATION_STORAGE_KEY,
  type StoredMetricInvestigation,
} from "@/components/intelligence/decision-metric-link";

const METRIC_CONTEXT_TTL_MS = 30 * 60 * 1000;

export function InvestigationContextBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [metricContext, setMetricContext] = useState<StoredMetricInvestigation | null>(null);

  const sourceInvestigationActive = searchParams.get("investigation") === "1";
  const source = searchParams.get("source")?.trim() || "Marketing evidence";
  const from = searchParams.get("from")?.trim() || "marketing";

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(METRIC_INVESTIGATION_STORAGE_KEY);
      if (!raw) {
        setMetricContext(null);
        return;
      }

      const parsed = JSON.parse(raw) as StoredMetricInvestigation;
      const age = Date.now() - Number(parsed.createdAt || 0);
      if (!parsed.targetPath || !parsed.sourcePath || age < 0 || age > METRIC_CONTEXT_TTL_MS) {
        window.sessionStorage.removeItem(METRIC_INVESTIGATION_STORAGE_KEY);
        setMetricContext(null);
        return;
      }

      const target = new URL(parsed.targetPath, window.location.origin);
      setMetricContext(target.pathname === pathname ? parsed : null);
    } catch {
      setMetricContext(null);
    }
  }, [pathname, searchParams]);

  if (sourceInvestigationActive && (pathname === "/revenue" || /^\/leads\/[^/]+$/.test(pathname))) {
    return <SourceInvestigationBar pathname={pathname} source={source} from={from} />;
  }

  if (!metricContext) return null;

  return (
    <section className="mb-4 overflow-hidden rounded-2xl border border-[#d5e2d7] bg-[linear-gradient(135deg,#f4f8f3_0%,#fbfcfa_62%,#eef6f0_100%)] shadow-[0_12px_32px_rgba(16,45,39,.045)]">
      <div className="flex flex-col gap-4 px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-[#cfe0d5] bg-white/80 px-2 py-1 text-[8px] font-black uppercase tracking-[.11em] text-[#527263]">
              Metric context
            </span>
            <span className="text-[9px] font-semibold text-[#8a978a]">
              from {metricContext.sourceLabel}
            </span>
            {metricContext.scopeLabel ? (
              <span className="rounded-full bg-white/70 px-2 py-1 text-[8px] font-semibold text-[#6e7f73]">
                {metricContext.scopeLabel}
              </span>
            ) : null}
          </div>

          <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-sm font-semibold tracking-[-.015em] text-[#102d27]">
              {metricContext.metricLabel}
            </span>
            <span className="text-lg font-semibold tracking-[-.025em] text-[#102d27]">
              {metricContext.metricValue}
            </span>
          </div>

          {metricContext.metricDetail ? (
            <p className="mt-1 max-w-3xl text-[10px] leading-5 text-[#758279]">
              {metricContext.metricDetail}
            </p>
          ) : null}

          <div className="mt-2 flex flex-wrap gap-2 text-[8px] font-semibold uppercase tracking-[.08em] text-[#718178]">
            {metricContext.evidenceLabel ? <span>{metricContext.evidenceLabel}</span> : null}
            <span>Reference context only</span>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <Link href={metricContext.sourcePath} className="btn-secondary">
            <ArrowLeft size={13} /> Back to {metricContext.sourceLabel}
          </Link>
          <button type="button" className="btn-secondary" onClick={() => clearMetricContext(setMetricContext)}>
            <X size={13} /> Clear
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-[#e1e9e2] bg-white/45 px-4 py-2.5 text-[9px] font-semibold text-[#62766b] sm:px-5">
        <ArrowRight size={11} /> This preserves what you were investigating; the destination keeps its own data scope unless a filter is explicitly synchronized.
      </div>
    </section>
  );
}

function SourceInvestigationBar({
  pathname,
  source,
  from,
}: {
  pathname: string;
  source: string;
  from: string;
}) {
  const encodedSource = encodeURIComponent(source);
  const attributionHref = `/marketing?view=attribution&q=${encodedSource}`;
  const funnelHref = "/marketing?view=funnel";
  const campaignHref = `/marketing?view=campaigns&q=${encodedSource}`;
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
          <Link href={pathname} className="btn-secondary" title="Clear investigation context" onClick={() => clearStoredMetricContext()}><X size={13} /> Clear</Link>
        </div>
      </div>
      <div className="flex items-center gap-2 border-t border-[#e1e9e2] bg-white/45 px-4 py-2.5 text-[9px] font-semibold text-[#62766b] sm:px-5">
        <ArrowRight size={11} /> Evidence path remains explicit; unknown attribution and missing commercial values stay unknown.
      </div>
    </section>
  );
}

function clearMetricContext(setMetricContext: (value: StoredMetricInvestigation | null) => void) {
  clearStoredMetricContext();
  setMetricContext(null);
}

function clearStoredMetricContext() {
  try {
    window.sessionStorage.removeItem(METRIC_INVESTIGATION_STORAGE_KEY);
  } catch {
    // Clearing context should never interrupt navigation.
  }
}

function pretty(value: string) {
  return value.replaceAll("_", " ").replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
