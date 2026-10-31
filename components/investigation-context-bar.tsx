"use client";

import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CircleDollarSign,
  GitBranch,
  Info,
  Target,
  X,
} from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import {
  METRIC_INVESTIGATION_STORAGE_KEY,
  type StoredMetricInvestigation,
} from "@/components/intelligence/decision-metric-link";
import { canonicalizeWorkspaceHref } from "@/lib/canonical-workspace-routes";
import type { MetricEvidenceState } from "@/lib/metric-definitions";
import { resolveMetricNextCheck } from "@/lib/metric-investigation-guidance";

const METRIC_CONTEXT_TTL_MS = 30 * 60 * 1000;

type RelatedLink = {
  label: string;
  href: string;
};

const evidenceStyles: Record<MetricEvidenceState, string> = {
  observed:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/25 dark:text-emerald-300",
  derived:
    "border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-900/60 dark:bg-brand-950/25 dark:text-brand-300",
  partial:
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/25 dark:text-amber-300",
  unknown: "border-line bg-surface-muted text-copy-muted",
};

const evidenceNames: Record<MetricEvidenceState, string> = {
  observed: "Observed",
  derived: "Derived",
  partial: "Partial evidence",
  unknown: "Unknown",
};

export function InvestigationContextBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [metricContext, setMetricContext] =
    useState<StoredMetricInvestigation | null>(null);

  const sourceInvestigationActive = searchParams.get("investigation") === "1";
  const source = searchParams.get("source")?.trim() || "Marketing evidence";
  const from = searchParams.get("from")?.trim() || "marketing";

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(
        METRIC_INVESTIGATION_STORAGE_KEY,
      );
      if (!raw) {
        setMetricContext(null);
        return;
      }

      const parsed = JSON.parse(raw) as StoredMetricInvestigation;
      const age = Date.now() - Number(parsed.createdAt || 0);
      if (
        !parsed.targetPath ||
        !parsed.sourcePath ||
        age < 0 ||
        age > METRIC_CONTEXT_TTL_MS
      ) {
        window.sessionStorage.removeItem(METRIC_INVESTIGATION_STORAGE_KEY);
        setMetricContext(null);
        return;
      }

      const canonicalTarget = canonicalizeWorkspaceHref(parsed.targetPath);
      const target = new URL(canonicalTarget, window.location.origin);
      setMetricContext(
        target.pathname === pathname
          ? { ...parsed, targetPath: canonicalTarget }
          : null,
      );
    } catch {
      setMetricContext(null);
    }
  }, [pathname, searchParams]);

  if (
    sourceInvestigationActive &&
    (pathname === "/revenue" || /^\/leads\/[^/]+$/.test(pathname))
  ) {
    return (
      <SourceInvestigationBar pathname={pathname} source={source} from={from} />
    );
  }

  if (!metricContext) return null;

  const currentPath = `${pathname}${searchParams.size ? `?${searchParams.toString()}` : ""}`;
  const nextCheck = resolveMetricNextCheck(metricContext.metricLabel);
  const relatedLinks = metricRelatedLinks(metricContext.metricLabel)
    .map((item) => ({
      ...item,
      href: canonicalizeWorkspaceHref(item.href),
    }))
    .filter(
      (item) =>
        item.href !== currentPath && item.href !== metricContext.targetPath,
    );

  return (
    <section className="mb-4 overflow-hidden rounded-panel border border-line bg-surface shadow-card">
      <div className="relative">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-[radial-gradient(circle_at_14%_0%,rgba(109,76,255,.09),transparent_42%),radial-gradient(circle_at_86%_0%,rgba(109,76,255,.045),transparent_38%)]"
          aria-hidden="true"
        />

        <div className="relative flex flex-col gap-4 px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-brand-200 bg-brand-50 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.11em] text-brand-700 dark:border-brand-900/60 dark:bg-brand-950/25 dark:text-brand-300">
                Investigation context
              </span>
              <span className="text-[10px] font-semibold text-copy-subtle">
                from {metricContext.sourceLabel}
              </span>
              {metricContext.scopeLabel ? (
                <span className="rounded-full border border-line bg-surface-muted px-2 py-1 text-[9px] font-semibold text-copy-muted">
                  {metricContext.scopeLabel}
                </span>
              ) : null}
            </div>

            <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-sm font-semibold text-copy-muted">
                {metricContext.metricLabel}
              </span>
              <span className="text-[22px] font-semibold tracking-[-0.035em] text-copy-strong">
                {metricContext.metricValue}
              </span>
            </div>

            {metricContext.metricDetail ? (
              <p className="mt-1 max-w-3xl text-xs leading-5 text-copy-muted">
                {metricContext.metricDetail}
              </p>
            ) : null}

            {nextCheck ? (
              <div className="mt-3 flex max-w-3xl items-start gap-2 rounded-xl border border-line bg-surface-muted/55 px-3 py-2.5">
                <ArrowRight size={12} className="mt-0.5 shrink-0 text-brand-700 dark:text-brand-300" />
                <div className="min-w-0">
                  <div className="text-[9px] font-bold uppercase tracking-[0.1em] text-copy-subtle">
                    Next check
                  </div>
                  <p className="mt-0.5 text-[11px] leading-5 text-copy-muted">
                    {nextCheck}
                  </p>
                </div>
              </div>
            ) : null}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {metricContext.evidenceState ? (
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[9px] font-semibold ${evidenceStyles[metricContext.evidenceState]}`}
                >
                  {metricContext.evidenceState === "observed" ? (
                    <CheckCircle2 size={10} />
                  ) : (
                    <Info size={10} />
                  )}
                  {evidenceNames[metricContext.evidenceState]}
                </span>
              ) : null}
              {metricContext.evidenceLabel ? (
                <span className="text-[9px] font-semibold text-copy-subtle">
                  {metricContext.evidenceLabel}
                </span>
              ) : null}
              <span className="text-[9px] font-semibold text-copy-subtle">
                Reference context only · destination data remains authoritative
              </span>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap gap-2">
            {relatedLinks.slice(0, 2).map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="btn-secondary"
                onClick={() => continueMetricContext(metricContext, item.href)}
              >
                {item.label} <ArrowRight size={13} />
              </Link>
            ))}
            <Link href={metricContext.sourcePath} className="btn-secondary">
              <ArrowLeft size={13} /> Back to {metricContext.sourceLabel}
            </Link>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => clearMetricContext(setMetricContext)}
            >
              <X size={13} /> Clear
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-line bg-surface-muted/55 px-4 py-2.5 text-[10px] font-medium text-copy-muted sm:px-5">
        <ArrowRight size={11} /> The investigation thread preserves the question you were following; it does not synchronize filters or infer missing evidence.
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
    <section className="mb-4 overflow-hidden rounded-panel border border-line bg-surface shadow-card">
      <div className="relative">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-[radial-gradient(circle_at_14%_0%,rgba(109,76,255,.09),transparent_42%),radial-gradient(circle_at_86%_0%,rgba(109,76,255,.045),transparent_38%)]"
          aria-hidden="true"
        />
        <div className="relative flex flex-col gap-4 px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-brand-200 bg-brand-50 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.11em] text-brand-700 dark:border-brand-900/60 dark:bg-brand-950/25 dark:text-brand-300">
                Investigation active
              </span>
              <span className="text-[10px] font-semibold text-copy-subtle">
                from {pretty(from)}
              </span>
            </div>
            <div className="mt-3 text-sm font-semibold tracking-[-0.015em] text-copy-strong">
              Following “{source}” across marketing → revenue → CRM
            </div>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-copy-muted">
              SalsysOS preserves the evidence thread while you move between attribution, commercial outcomes and customer records. The context is navigational only; it does not alter or infer the underlying data.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link href={attributionHref} className="btn-secondary">
              <ArrowLeft size={13} /> Attribution
            </Link>
            <Link href={campaignHref} className="btn-secondary">
              <Target size={13} /> Campaigns
            </Link>
            <Link href={funnelHref} className="btn-secondary">
              <GitBranch size={13} /> Funnel
            </Link>
            {pathname !== "/revenue" ? (
              <Link href={revenueHref} className="btn-secondary">
                <CircleDollarSign size={13} /> Revenue
              </Link>
            ) : null}
            <Link
              href={pathname}
              className="btn-secondary"
              title="Clear investigation context"
              onClick={() => clearStoredMetricContext()}
            >
              <X size={13} /> Clear
            </Link>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 border-t border-line bg-surface-muted/55 px-4 py-2.5 text-[10px] font-medium text-copy-muted sm:px-5">
        <ArrowRight size={11} /> Evidence lineage remains explicit; unknown attribution and missing commercial values stay unknown.
      </div>
    </section>
  );
}

function metricRelatedLinks(metricLabel: string): RelatedLink[] {
  const metric = metricLabel.trim().toLowerCase();

  if (metric === "new leads" || metric.includes("first touch")) {
    return [
      { label: "Work Queue", href: "/admissions?view=queue" },
      { label: "Leads", href: "/leads" },
    ];
  }

  if (
    metric.includes("capacity") ||
    metric.includes("calculated open") ||
    metric.includes("demand pressure") ||
    metric.includes("seats remain") ||
    metric.includes("upcoming batches") ||
    metric.includes("enrollment closed")
  ) {
    return [
      { label: "Admissions Capacity", href: "/admissions?view=capacity" },
      { label: "Operations", href: "/operations" },
    ];
  }

  if (
    metric.includes("contact coverage") ||
    metric.includes("median first response") ||
    metric.includes("median inbound response") ||
    metric.includes("never contacted") ||
    metric.includes("response time") ||
    metric.includes("response rate")
  ) {
    return [
      { label: "Response & SLA", href: "/performance?view=response" },
      { label: "Leads", href: "/leads" },
    ];
  }

  if (
    metric.includes("inbound contacts") ||
    metric.includes("outbound contacts") ||
    metric.includes("total contacts") ||
    metric.includes("marked successful")
  ) {
    return [
      { label: "Communication", href: "/performance?view=communication" },
      { label: "Leads", href: "/leads" },
    ];
  }

  if (metric.includes("payment")) {
    return [
      { label: "Payments", href: "/admissions?view=payments" },
      { label: "Revenue", href: "/revenue" },
    ];
  }

  if (metric.includes("qualified")) {
    return [
      { label: "Funnel", href: "/marketing?view=funnel" },
      { label: "Pipeline", href: "/admissions?view=pipeline" },
    ];
  }

  if (metric.includes("enroll")) {
    return [
      { label: "Pipeline", href: "/admissions?view=pipeline" },
      { label: "Revenue", href: "/revenue" },
    ];
  }

  if (metric.includes("collected") || metric.includes("revenue")) {
    return [
      { label: "Revenue", href: "/revenue" },
      { label: "Payments", href: "/admissions?view=payments" },
    ];
  }

  if (metric.includes("reply")) {
    return [
      { label: "Inbox", href: "/conversations" },
      { label: "Response & SLA", href: "/performance?view=response" },
    ];
  }

  if (metric.includes("follow")) {
    return [
      { label: "Follow-ups", href: "/follow-ups" },
      { label: "Work Queue", href: "/admissions?view=queue" },
    ];
  }

  if (metric.includes("pipeline") || metric.includes("high intent")) {
    return [
      { label: "Pipeline", href: "/admissions?view=pipeline" },
      { label: "Revenue", href: "/revenue" },
    ];
  }

  if (metric.includes("lead")) {
    return [
      { label: "Leads", href: "/leads" },
      { label: "Attribution", href: "/marketing?view=attribution" },
    ];
  }

  return [];
}

function continueMetricContext(
  context: StoredMetricInvestigation,
  href: string,
) {
  try {
    const canonicalHref = canonicalizeWorkspaceHref(href);
    window.sessionStorage.setItem(
      METRIC_INVESTIGATION_STORAGE_KEY,
      JSON.stringify({
        ...context,
        targetPath: canonicalHref,
        createdAt: Date.now(),
      }),
    );
  } catch {
    // Investigation navigation must remain functional without sessionStorage.
  }
}

function clearMetricContext(
  setMetricContext: (value: StoredMetricInvestigation | null) => void,
) {
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
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
